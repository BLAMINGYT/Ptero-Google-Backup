require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const readline = require('readline');

// Configure dayjs for Indian timezone
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Kolkata');

// ==================== CONFIGURATION ====================
const config = {
  ptero: {
    apiKey: process.env.PTERO_API_KEY,
    panelUrl: process.env.PTERO_PANEL_URL,
    serverId: process.env.PTERO_SERVER_ID,
    maxBackupsOnServer: 2, // Maximum backups allowed on Pterodactyl
  },
  google: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    daysFolderId: process.env.GOOGLE_DRIVE_DAYS_FOLDER_ID, // New: Days subfolder
  },
  tempDir: path.join(__dirname, 'temp_backups'),
  logsDir: path.join(__dirname, 'logs'),
  credentialsPath: path.join(__dirname, 'credentials.json'),
  tokenPath: path.join(__dirname, 'token.json'),
  maxBackups: 3,
  maxDailyBackups: 5, // Keep last 5 days in the days folder
  initialDelay: 30000,
  pollInterval: 10000,
  pollTimeout: 900000,
};

// ==================== LOGGING ====================
let logStream = null;

function ensureLogsDir() {
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }
}

function initializeLogFile() {
  const logFileName = `backup_${dayjs().tz().format('YYYY-MM-DD')}.log`;
  const logPath = path.join(config.logsDir, logFileName);
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  const message = args.join(' ');
  originalConsoleLog(message);
  if (logStream) {
    const timestamp = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
    logStream.write(`[${timestamp}] ${message}\n`);
  }
};

console.error = (...args) => {
  const message = args.join(' ');
  originalConsoleError(message);
  if (logStream) {
    const timestamp = dayjs().tz().format('YYYY-MM-DD HH:mm:ss');
    logStream.write(`[${timestamp}] ERROR: ${message}\n`);
  }
};

function validateConfig() {
  const required = ['PTERO_API_KEY', 'PTERO_PANEL_URL', 'PTERO_SERVER_ID', 'GOOGLE_DRIVE_FOLDER_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

function ensureTempDir() {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
    console.log(`📁 Created temp directory: ${config.tempDir}`);
  }
}

// ==================== GOOGLE OAUTH ====================
async function authorize() {
  let credentials;
  try {
    credentials = JSON.parse(fs.readFileSync(config.credentialsPath, 'utf8'));
  } catch (error) {
    console.error('❌ Error loading credentials.json');
    console.error('Please download OAuth credentials from Google Cloud Console');
    process.exit(1);
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(config.tokenPath)) {
    const token = JSON.parse(fs.readFileSync(config.tokenPath, 'utf8'));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  return getNewToken(oAuth2Client);
}

function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  console.log('\n🔐 Authorize this app by visiting this URL:\n');
  console.log(authUrl);
  console.log('\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error('Error retrieving access token', err);
          reject(err);
          return;
        }
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(config.tokenPath, JSON.stringify(token));
        console.log('✅ Token saved to', config.tokenPath);
        resolve(oAuth2Client);
      });
    });
  });
}

async function initGoogleDrive() {
  const auth = await authorize();
  return google.drive({ version: 'v3', auth });
}

// ==================== PTERODACTYL API ====================
const pteroClient = axios.create({
  baseURL: `${config.ptero.panelUrl}/api/client`,
  headers: {
    'Authorization': `Bearer ${config.ptero.apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

async function listPteroBackups() {
  console.log('📋 Checking existing backups on Pterodactyl...');
  const response = await pteroClient.get(`/servers/${config.ptero.serverId}/backups`);
  const backups = response.data.data.map(b => ({
    id: b.attributes.uuid,
    name: b.attributes.name,
    createdAt: b.attributes.created_at,
  }));
  console.log(`   Found ${backups.length} backup(s) on server`);
  return backups;
}

async function deleteOldestPteroBackup() {
  const backups = await listPteroBackups();
  
  if (backups.length >= config.ptero.maxBackupsOnServer) {
    // Sort by creation date (oldest first)
    backups.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const oldestBackup = backups[0];
    
    console.log(`🗑️  Deleting oldest backup: ${oldestBackup.name}`);
    await pteroClient.delete(`/servers/${config.ptero.serverId}/backups/${oldestBackup.id}`);
    console.log('✅ Oldest backup deleted from Pterodactyl');
    
    // Wait a bit for the deletion to process
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

async function createBackup() {
  console.log('🚀 Creating backup...');
  
  // Check and delete if limit reached
  await deleteOldestPteroBackup();
  
  const response = await pteroClient.post(`/servers/${config.ptero.serverId}/backups`);
  const backupId = response.data.attributes.uuid;
  console.log(`✅ Backup created: ${backupId}`);
  return backupId;
}

async function waitForBackupCompletion(backupId) {
  console.log('⏳ Waiting for backup to complete...');
  await new Promise(resolve => setTimeout(resolve, config.initialDelay));
  
  const startTime = Date.now();
  let checkCount = 0;

  while (true) {
    checkCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    if (Date.now() - startTime > config.pollTimeout) {
      throw new Error('Backup timeout exceeded');
    }

    const response = await pteroClient.get(`/servers/${config.ptero.serverId}/backups/${backupId}`);
    const backup = response.data.attributes;

    console.log(`   Check #${checkCount} (${elapsed}s) - Status: ${backup.is_successful === null ? 'In Progress' : backup.is_successful ? 'Success' : 'Failed'}`);

    if (backup.is_successful === true && backup.completed_at) {
      console.log('✅ Backup completed!');
      return backup;
    }

    if (backup.is_successful === null || (backup.is_successful === false && elapsed <= 60)) {
      await new Promise(resolve => setTimeout(resolve, config.pollInterval));
      continue;
    }

    if (backup.is_successful === false) {
      throw new Error('Backup failed on server');
    }
  }
}

async function getBackupDownloadUrl(backupId) {
  console.log('🔗 Getting download URL...');
  const response = await pteroClient.get(`/servers/${config.ptero.serverId}/backups/${backupId}/download`);
  console.log('✅ Download URL obtained');
  return response.data.attributes.url;
}

async function downloadBackup(downloadUrl, localPath) {
  console.log('⬇️  Downloading backup...');
  const response = await axios({
    method: 'get',
    url: downloadUrl,
    responseType: 'stream',
    timeout: 600000,
  });

  const writer = fs.createWriteStream(localPath);
  await pipeline(response.data, writer);

  const stats = fs.statSync(localPath);
  console.log(`✅ Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  return localPath;
}

async function deleteBackupFromPtero(backupId) {
  console.log('🗑️  Deleting backup from Pterodactyl...');
  try {
    await pteroClient.delete(`/servers/${config.ptero.serverId}/backups/${backupId}`);
    console.log('✅ Backup deleted from Pterodactyl');
  } catch (error) {
    console.error('⚠️  Failed to delete backup:', error.message);
  }
}

async function uploadToGoogleDrive(localPath) {
  console.log('☁️  Uploading to Google Drive...');
  
  const drive = await initGoogleDrive();
  const fileName = `${dayjs().tz().format('DD-MMM-hA')}.tar.gz`;
  const fileSize = fs.statSync(localPath).size;
  const fileStream = fs.createReadStream(localPath);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [config.google.folderId],
    },
    media: {
      mimeType: 'application/gzip',
      body: fileStream,
    },
    fields: 'id, name, createdTime',
  });

  console.log(`✅ Uploaded: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  return response.data;
}

async function uploadToDaysFolder(localPath) {
  if (!config.google.daysFolderId) {
    console.log('⚠️  Days folder ID not configured, skipping daily backup');
    return null;
  }

  console.log('📅 Uploading to Days folder...');
  
  const drive = await initGoogleDrive();
  const fileName = `${dayjs().tz().format('DD-MMM-YYYY')}.tar.gz`;
  const fileSize = fs.statSync(localPath).size;
  const fileStream = fs.createReadStream(localPath);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [config.google.daysFolderId],
    },
    media: {
      mimeType: 'application/gzip',
      body: fileStream,
    },
    fields: 'id, name, createdTime',
  });

  console.log(`✅ Daily backup uploaded: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  return response.data;
}

async function cleanupOldBackups() {
  console.log('🧹 Cleaning up old backups in main folder...');
  
  const drive = await initGoogleDrive();
  const response = await drive.files.list({
    q: `'${config.google.folderId}' in parents and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files;
  console.log(`📊 Found ${files.length} backup(s) in main folder`);

  if (files.length > config.maxBackups) {
    const filesToDelete = files.slice(config.maxBackups);
    console.log(`🗑️  Deleting ${filesToDelete.length} old backup(s)...`);

    for (const file of filesToDelete) {
      await drive.files.delete({ fileId: file.id });
      console.log(`   ✅ Deleted: ${file.name}`);
    }
  }
}

async function cleanupOldDailyBackups() {
  if (!config.google.daysFolderId) {
    return;
  }

  console.log('🧹 Cleaning up old daily backups in days folder...');
  
  const drive = await initGoogleDrive();
  const response = await drive.files.list({
    q: `'${config.google.daysFolderId}' in parents and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files;
  console.log(`📊 Found ${files.length} daily backup(s)`);

  if (files.length > config.maxDailyBackups) {
    const filesToDelete = files.slice(config.maxDailyBackups);
    console.log(`🗑️  Deleting ${filesToDelete.length} old daily backup(s)...`);

    for (const file of filesToDelete) {
      await drive.files.delete({ fileId: file.id });
      console.log(`   ✅ Deleted: ${file.name}`);
    }
  }
}

function isDailyBackupTime() {
  const now = dayjs().tz();
  const hour = now.hour();
  const minute = now.minute();
  
  // Check if it's 11:59 PM (23:59)
  return hour === 23 && minute === 59;
}

async function runBackupCycle() {
  console.log('\n' + '='.repeat(60));
  console.log(`🕐 Backup cycle started: ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`);
  console.log('='.repeat(60));

  let backupId = null;
  let localPath = null;

  try {
    backupId = await createBackup();
    await waitForBackupCompletion(backupId);
    const downloadUrl = await getBackupDownloadUrl(backupId);
    
    const fileName = `backup_${dayjs().tz().format('YYYY-MM-DD_HH-mm-ss')}.tar.gz`;
    localPath = path.join(config.tempDir, fileName);
    await downloadBackup(downloadUrl, localPath);
    
    // Upload to main folder
    await uploadToGoogleDrive(localPath);
    
    // Check if it's time for daily backup (11:59 PM)
    if (isDailyBackupTime()) {
      console.log('🌙 Daily backup time detected!');
      await uploadToDaysFolder(localPath);
      await cleanupOldDailyBackups();
    }
    
    await deleteBackupFromPtero(backupId);
    await cleanupOldBackups();

    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log('🗑️  Local file deleted');
    }

    console.log('✅ Backup cycle completed!');
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    if (backupId) await deleteBackupFromPtero(backupId);
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
  }

  console.log('='.repeat(60) + '\n');
}

async function main() {
  console.log('\n🎯 Pterodactyl Auto-Backup (Enhanced Version)\n');
  console.log(`🌏 Timezone: Asia/Kolkata (IST)\n`);

  validateConfig();
  ensureTempDir();
  ensureLogsDir();
  initializeLogFile();

  console.log('⚙️  Configuration:');
  console.log(`   Panel: ${config.ptero.panelUrl}`);
  console.log(`   Server: ${config.ptero.serverId}`);
  console.log(`   Main Folder: ${config.google.folderId}`);
  console.log(`   Days Folder: ${config.google.daysFolderId || 'Not configured'}`);
  console.log(`   Max Backups (Main): ${config.maxBackups}`);
  console.log(`   Max Daily Backups: ${config.maxDailyBackups}`);
  console.log(`   Max Ptero Backups: ${config.ptero.maxBackupsOnServer}\n`);

  // Initialize Google Drive
  console.log('🔐 Initializing Google Drive...');
  await initGoogleDrive();
  console.log('✅ Google Drive ready!\n');

  console.log('🚀 Running initial backup...');
  await runBackupCycle();

  console.log('⏰ Setting up automated backups...');
  console.log('📅 Regular backups: Every 20 minutes');
  console.log('🌙 Daily backup: Every day at 11:59 PM IST');
  
  cron.schedule('*/20 * * * *', async () => {
    await runBackupCycle();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ Cron scheduled successfully');
  console.log('📝 Press Ctrl+C to stop\n');
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  if (logStream) logStream.end();
  process.exit(0);
});

main().catch(error => {
  console.error('💥 Fatal error:', error);
  if (logStream) logStream.end();
  process.exit(1);
});
