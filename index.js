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
  },
  google: {
    mainFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    daysFolderId: process.env.GOOGLE_DRIVE_DAYS_FOLDER_ID,
  },
  tempDir: path.join(__dirname, 'temp_backups'),
  logsDir: path.join(__dirname, 'logs'),
  credentialsPath: path.join(__dirname, 'credentials.json'),
  tokenPath: path.join(__dirname, 'token.json'),
  maxBackups: 3,
  maxDailyBackups: 5,
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
  const logFileName = `backup_${dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD')}.log`;
  const logPath = path.join(config.logsDir, logFileName);
  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  const message = args.join(' ');
  originalConsoleLog(message);
  if (logStream) {
    const timestamp = dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    logStream.write(`[${timestamp}] ${message}\n`);
  }
};

console.error = (...args) => {
  const message = args.join(' ');
  originalConsoleError(message);
  if (logStream) {
    const timestamp = dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
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

  if (!process.env.GOOGLE_DRIVE_DAYS_FOLDER_ID) {
    console.log('⚠️  GOOGLE_DRIVE_DAYS_FOLDER_ID not set - daily backups feature disabled');
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

async function getAllBackups() {
  console.log('📋 Fetching existing backups...');
  const response = await pteroClient.get(`/servers/${config.ptero.serverId}/backups`);
  const backups = response.data.data;
  console.log(`📊 Found ${backups.length} existing backup(s) on Pterodactyl`);
  return backups;
}

async function deleteOldestBackupIfLimitReached() {
  const backups = await getAllBackups();

  if (backups.length >= 3) {
    console.log('⚠️  Backup limit reached, deleting oldest backup...');
    
    const sortedBackups = backups.sort((a, b) => 
      new Date(a.attributes.created_at) - new Date(b.attributes.created_at)
    );
    
    const oldestBackup = sortedBackups[0];
    const backupId = oldestBackup.attributes.uuid;
    
    try {
      await pteroClient.delete(`/servers/${config.ptero.serverId}/backups/${backupId}`);
      console.log(`✅ Deleted oldest backup: ${backupId}`);
    } catch (error) {
      console.error('❌ Failed to delete old backup:', error.message);
      throw error;
    }
  }
}

async function createBackup() {
  await deleteOldestBackupIfLimitReached();
  
  console.log('🚀 Creating new backup...');
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

async function uploadBackupToServer(localPath) {
  console.log('📤 Uploading backup to Pterodactyl server...');
  
  // Get upload URL
  const response = await pteroClient.get(`/servers/${config.ptero.serverId}/files/upload`);
  const uploadUrl = response.data.attributes.url;
  
  // Upload file using FormData
  const FormData = require('form-data');
  const form = new FormData();
  form.append('files', fs.createReadStream(localPath));
  
  await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  
  console.log('✅ Backup uploaded to server successfully!');
  return true;
}

async function uploadToGoogleDrive(localPath, folderId, fileName) {
  console.log(`☁️  Uploading to Google Drive (${fileName})...`);
  
  const drive = await initGoogleDrive();
  const fileSize = fs.statSync(localPath).size;
  const fileStream = fs.createReadStream(localPath);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
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

async function downloadFromGoogleDrive(fileId, localPath) {
  console.log('⬇️  Downloading from Google Drive...');
  
  const drive = await initGoogleDrive();
  const dest = fs.createWriteStream(localPath);
  
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  
  await pipeline(response.data, dest);
  
  const stats = fs.statSync(localPath);
  console.log(`✅ Download complete: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  return localPath;
}

async function cleanupOldBackups(folderId, maxBackups) {
  console.log(`🧹 Cleaning up old backups (max: ${maxBackups})...`);
  
  const drive = await initGoogleDrive();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'createdTime desc',
  });

  const files = response.data.files;
  console.log(`📊 Found ${files.length} backup(s) in folder`);

  if (files.length > maxBackups) {
    const filesToDelete = files.slice(maxBackups);
    console.log(`🗑️  Deleting ${filesToDelete.length} old backup(s)...`);

    for (const file of filesToDelete) {
      await drive.files.delete({ fileId: file.id });
      console.log(`   ✅ Deleted: ${file.name}`);
    }
  }
}

async function runBackupCycle(isDailyBackup = false) {
  const now = dayjs().tz('Asia/Kolkata');
  console.log('\n' + '='.repeat(60));
  console.log(`🕐 ${isDailyBackup ? 'DAILY' : 'REGULAR'} Backup cycle started: ${now.format('YYYY-MM-DD HH:mm:ss')} IST`);
  console.log('='.repeat(60));

  let backupId = null;
  let localPath = null;

  try {
    backupId = await createBackup();
    await waitForBackupCompletion(backupId);
    const downloadUrl = await getBackupDownloadUrl(backupId);
    
    const tempFileName = `backup_${now.format('YYYY-MM-DD_HH-mm-ss')}.tar.gz`;
    localPath = path.join(config.tempDir, tempFileName);
    await downloadBackup(downloadUrl, localPath);

    // Upload to main folder
    const mainFileName = `${now.format('DD-MMM-hA')}.tar.gz`;
    await uploadToGoogleDrive(localPath, config.google.mainFolderId, mainFileName);
    await cleanupOldBackups(config.google.mainFolderId, config.maxBackups);

    // If it's a daily backup, also upload to days folder
    if (isDailyBackup && config.google.daysFolderId) {
      console.log('\n📅 Uploading daily backup to "days" folder...');
      const dailyFileName = `${now.format('DD-MMM-YYYY')}.tar.gz`;
      await uploadToGoogleDrive(localPath, config.google.daysFolderId, dailyFileName);
      await cleanupOldBackups(config.google.daysFolderId, config.maxDailyBackups);
    }

    await deleteBackupFromPtero(backupId);

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

// ==================== RESTORE COMMAND ====================
async function restoreBackupFromDrive(fileId) {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 RESTORE BACKUP FROM GOOGLE DRIVE');
  console.log('='.repeat(60));
  
  let localPath = null;
  
  try {
    const drive = await initGoogleDrive();
    
    // Get file info
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: 'name, size'
    });
    
    const fileName = fileInfo.data.name;
    const fileSizeMB = (parseInt(fileInfo.data.size || 0) / 1024 / 1024).toFixed(2);
    
    console.log(`📋 File: ${fileName} (${fileSizeMB} MB)`);
    console.log(`📋 File ID: ${fileId}`);
    
    // Download from Google Drive
    localPath = path.join(config.tempDir, `restore_${fileName}`);
    await downloadFromGoogleDrive(fileId, localPath);
    
    // Upload to Pterodactyl server
    await uploadBackupToServer(localPath);
    
    // Cleanup
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log('🗑️  Local file deleted');
    }
    
    console.log('✅ Restore completed successfully!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== DISK UPLOAD TO SERVER ====================
async function diskUploadToServer(serverPath) {
  console.log('\n' + '='.repeat(60));
  console.log('📤 UPLOAD FILE FROM SERVER DISK TO PTERODACTYL');
  console.log('='.repeat(60));
  
  try {
    console.log(`📋 Server Path: ${serverPath}`);
    
    // Create a backup from the specified path
    console.log('🚀 Creating backup from specified path...');
    const response = await pteroClient.post(`/servers/${config.ptero.serverId}/backups`, {
      ignored: `*\n!${serverPath}`  // Backup only the specified path
    });
    
    const backupId = response.data.attributes.uuid;
    console.log(`✅ Backup created: ${backupId}`);
    
    await waitForBackupCompletion(backupId);
    const downloadUrl = await getBackupDownloadUrl(backupId);
    
    const now = dayjs().tz('Asia/Kolkata');
    const fileName = `disk_${path.basename(serverPath)}_${now.format('YYYY-MM-DD_HH-mm-ss')}.tar.gz`;
    const localPath = path.join(config.tempDir, fileName);
    
    await downloadBackup(downloadUrl, localPath);
    await uploadToGoogleDrive(localPath, config.google.mainFolderId, fileName);
    await deleteBackupFromPtero(backupId);
    
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log('🗑️  Local file deleted');
    }
    
    console.log('✅ Disk upload completed successfully!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Disk upload failed:', error.message);
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== DISK DOWNLOAD FROM DRIVE ====================
async function diskDownloadFromDrive(fileId) {
  console.log('\n' + '='.repeat(60));
  console.log('⬇️  DOWNLOAD FILE FROM GOOGLE DRIVE TO SERVER');
  console.log('='.repeat(60));
  
  let localPath = null;
  
  try {
    const drive = await initGoogleDrive();
    
    // Get file info
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: 'name, size'
    });
    
    const fileName = fileInfo.data.name;
    const fileSizeMB = (parseInt(fileInfo.data.size || 0) / 1024 / 1024).toFixed(2);
    
    console.log(`📋 File: ${fileName} (${fileSizeMB} MB)`);
    console.log(`📋 File ID: ${fileId}`);
    
    // Download from Google Drive
    localPath = path.join(config.tempDir, `download_${fileName}`);
    await downloadFromGoogleDrive(fileId, localPath);
    
    // Upload to Pterodactyl server
    await uploadBackupToServer(localPath);
    
    // Cleanup
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log('🗑️  Local file deleted');
    }
    
    console.log('✅ Download to server completed successfully!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
    
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== DRIVE UPLOAD FROM LOCAL ====================
async function driveUploadFromLocal(localFilePath) {
  console.log('\n' + '='.repeat(60));
  console.log('☁️  UPLOAD FILE FROM LOCAL TO GOOGLE DRIVE');
  console.log('='.repeat(60));
  
  try {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File not found: ${localFilePath}`);
    }
    
    const fileName = path.basename(localFilePath);
    const fileSize = fs.statSync(localFilePath).size / 1024 / 1024;
    
    console.log(`📋 File: ${fileName} (${fileSize.toFixed(2)} MB)`);
    console.log(`📋 Local Path: ${localFilePath}`);
    
    await uploadToGoogleDrive(localFilePath, config.google.mainFolderId, fileName);
    
    console.log('✅ Upload to Drive completed successfully!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== COMMAND HANDLER ====================
function setupCommandListener() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
  });

  rl.on('line', async (line) => {
    const parts = line.trim().split(/\s+/);
    
    if (parts.length === 0 || !parts[0]) {
      return;
    }
    
    const cmd = parts[0].toLowerCase();
    
    if (cmd === 'upload') {
      if (parts.length < 2) {
        console.log('❌ Usage: upload <google_drive_file_id>');
        console.log('Example: upload 1a2b3c4d5e6f7g8h9i0j');
        return;
      }
      
      const fileId = parts[1].trim();
      await restoreBackupFromDrive(fileId);
    }
    else if (cmd === 'dskup') {
      if (parts.length < 2) {
        console.log('❌ Usage: dskup <server_file_path>');
        console.log('Example: dskup /world/region/r.0.0.mca');
        console.log('Example: dskup plugins/MyPlugin');
        return;
      }
      
      const serverPath = parts.slice(1).join(' ').trim();
      await diskUploadToServer(serverPath);
    }
    else if (cmd === 'dskdn') {
      if (parts.length < 2) {
        console.log('❌ Usage: dskdn <google_drive_file_id>');
        console.log('Example: dskdn 1a2b3c4d5e6f7g8h9i0j');
        return;
      }
      
      const fileId = parts[1].trim();
      await diskDownloadFromDrive(fileId);
    }
    else if (cmd === 'driup') {
      if (parts.length < 2) {
        console.log('❌ Usage: driup <local_file_path>');
        console.log('Example: driup /home/user/myfile.zip');
        console.log('Example: driup ./backup.tar.gz');
        return;
      }
      
      const localPath = parts.slice(1).join(' ').trim();
      await driveUploadFromLocal(localPath);
    }
    else if (cmd === 'backup') {
      console.log('🚀 Running manual backup cycle...');
      await runBackupCycle(false);
    }
    else if (cmd === 'help') {
      console.log('\n📚 Available Commands:');
      console.log('  upload <file_id>    - Download backup from Google Drive and upload to server');
      console.log('  dskup <path>        - Upload file from server disk to Google Drive');
      console.log('  dskdn <file_id>     - Download from Google Drive and upload to server disk');
      console.log('  driup <local_path>  - Upload file from local folder to Google Drive');
      console.log('  backup              - Run backup cycle manually');
      console.log('  help                - Show this help message');
      console.log('  exit                - Stop the script');
      console.log();
    }
    else if (cmd === 'exit') {
      console.log('👋 Exiting...');
      if (logStream) logStream.end();
      process.exit(0);
    }
    else {
      console.log(`❌ Unknown command: ${cmd}`);
      console.log('Type "help" for available commands');
    }
  });
}

async function main() {
  console.log('\n🎯 Pterodactyl Auto-Backup (Enhanced Node.js Version)\n');

  validateConfig();
  ensureTempDir();
  ensureLogsDir();
  initializeLogFile();

  console.log('⚙️  Configuration:');
  console.log(`   Panel: ${config.ptero.panelUrl}`);
  console.log(`   Server: ${config.ptero.serverId}`);
  console.log(`   Main Folder: ${config.google.mainFolderId}`);
  console.log(`   Days Folder: ${config.google.daysFolderId || 'Not configured'}`);
  console.log(`   Max Backups (Main): ${config.maxBackups}`);
  console.log(`   Max Backups (Daily): ${config.maxDailyBackups}`);
  console.log(`   Timezone: Asia/Kolkata (IST)\n`);

  console.log('🔐 Initializing Google Drive...');
  await initGoogleDrive();
  console.log('✅ Google Drive ready!\n');

  console.log('🚀 Running initial backup...');
  await runBackupCycle();

  // Regular backups every 20 minutes
  cron.schedule('*/20 * * * *', async () => {
    await runBackupCycle(false);
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Daily backup at 11:59 PM IST
  if (config.google.daysFolderId) {
    cron.schedule('59 23 * * *', async () => {
      await runBackupCycle(true);
    }, {
      timezone: 'Asia/Kolkata'
    });
    console.log('✅ Daily backup scheduled: 11:59 PM IST');
  }

  console.log('✅ Regular backup scheduled: Every 20 minutes (IST)');
  
  console.log('\n📝 Available Commands:');
  console.log('  upload <file_id>    - Restore backup from Google Drive to server');
  console.log('  dskup <path>        - Upload file from server disk to Google Drive');
  console.log('  dskdn <file_id>     - Download from Drive and upload to server disk');
  console.log('  driup <local_path>  - Upload file from local folder to Google Drive');
  console.log('  backup              - Run backup cycle manually');
  console.log('  help                - Show help message');
  console.log('  exit                - Stop the script');
  console.log('\n💡 Type a command or press Ctrl+C to stop\n');
  
  // Setup command listener
  setupCommandListener();
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
