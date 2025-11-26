# 🚀 Pterodactyl Auto-Backup Script

**Owner:** [Blamingyt](https://github.com/Blamingyt)

Automated backup solution for Pterodactyl game servers with Google Drive integration. Features automatic backup rotation, Indian timezone support, and daily snapshot archiving.

---

## ✨ Features

- 🔄 **Automatic Backups**: Runs every 20 minutes
- 🌏 **Indian Timezone (IST)**: All timestamps in Asia/Kolkata time
- 📁 **Dual Storage**: Regular backups + Daily snapshots
- 🗑️ **Smart Cleanup**: Auto-deletes old backups from Pterodactyl and Google Drive
- 📅 **Daily Snapshots**: Special backup at 11:59 PM saved for 5 days
- 📝 **Detailed Logging**: Daily log files with timestamps
- ☁️ **Google Drive**: Secure cloud storage with OAuth 2.0

---

## 📋 Requirements

### 1. **Node.js & npm**
- Node.js v14 or higher
- npm (comes with Node.js)

```bash
# Check your versions
node --version
npm --version
```

### 2. **Pterodactyl Panel**
- Active Pterodactyl panel installation
- API key with backup permissions
- Server ID

### 3. **Google Cloud Project**
- Google account
- Google Cloud Console access
- Google Drive API enabled

### 4. **System Requirements**
- Sufficient disk space for temporary backup files
- Stable internet connection
- Linux/Windows/macOS compatible

---

## 📦 Installation

### Step 1: Clone/Download the Script

```bash
# Create project directory
mkdir pterodactyl-backup
cd pterodactyl-backup

# Copy the script file (save as index.js)
# Copy package.json dependencies
```

### Step 2: Install Dependencies

## For Py Use this 

```bash
pip install requests schedule python-dotenv google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client pytz
```


## For Nodejs Do This
Create a `package.json` file:

```json
{
  "name": "pterodactyl-auto-backup",
  "version": "2.0.0",
  "description": "Automated Pterodactyl backup with Google Drive",
  "main": "index.js",
  "author": "Blamingyt",
  "license": "MIT",
  "dependencies": {
    "axios": "^1.6.0",
    "dayjs": "^1.11.10",
    "dotenv": "^16.3.1",
    "googleapis": "^128.0.0",
    "node-cron": "^3.0.3"
  }
}
```

Install packages:

```bash
npm install
```

---

## 🔧 Configuration

### Step 1: Get Pterodactyl API Key

1. Login to your Pterodactyl panel
2. Go to **Account Settings** → **API Credentials**
3. Click **Create API Key**
4. Give it a description (e.g., "Backup Script")
5. Copy the generated key (save it securely!)

### Step 2: Get Server ID

1. Go to your server in Pterodactyl
2. Look at the URL: `https://panel.example.com/server/XXXXXXXX`
3. The `XXXXXXXX` is your Server ID

### Step 3: Setup Google Drive

#### A. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **New Project**
3. Name it (e.g., "Pterodactyl Backup")
4. Click **Create**

#### B. Enable Google Drive API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click it and press **Enable**

#### C. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen:
   - Choose **External**
   - Fill in app name (e.g., "Backup Script")
   - Add your email as test user
   - Save
4. Back to Create OAuth client ID:
   - Application type: **Desktop app**
   - Name: "Backup Script"
   - Click **Create**
5. **Download JSON** file
6. Rename it to `credentials.json` and place in project folder

#### D. Get Google Drive Folder IDs

**For Main Backups Folder:**
1. Create a folder in Google Drive (e.g., "Server Backups")
2. Open the folder
3. Look at URL: `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXXX`
4. Copy the folder ID (`XXXXXXXXXXXXXXXXXXX`)

**For Daily Snapshots Folder:**
1. Inside "Server Backups", create a subfolder called "days"
2. Open it and copy its folder ID the same way

### Step 4: Create Environment File

Create a `.env` file in your project folder:

```env
# Pterodactyl Configuration
PTERO_API_KEY=your_pterodactyl_api_key_here
PTERO_PANEL_URL=https://panel.example.com
PTERO_SERVER_ID=your_server_id_here

# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=your_main_folder_id_here
GOOGLE_DRIVE_DAYS_FOLDER_ID=your_days_folder_id_here
```

**Example:**
```env
PTERO_API_KEY=ptlc_1234567890abcdefghijklmnopqrstuvwxyz
PTERO_PANEL_URL=https://panel.myserver.com
PTERO_SERVER_ID=a1b2c3d4

GOOGLE_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
GOOGLE_DRIVE_DAYS_FOLDER_ID=2BcDeFgHiJkLmNoPqRsTuVwXyZ
```

---

## 🚀 First Run & Authentication

### Run the Script

```bash
node index.js
```

### Google OAuth Authentication

On first run, you'll see:

```
🔐 Authorize this app by visiting this URL:

https://accounts.google.com/o/oauth2/v2/auth?...

Enter the code from that page here:
```

**Steps:**
1. Copy the URL and open in browser
2. Login with your Google account
3. Click **Allow** to grant permissions
4. Copy the authorization code **From The Url**
5. Paste it in the terminal
6. Press Enter

The script will save a `token.json` file for future use.

---

## 📁 Project Structure

```
pterodactyl-backup/
├── index.js                 # Main script
├── package.json             # Dependencies
├── .env                     # Configuration (DO NOT SHARE!)
├── credentials.json         # Google OAuth credentials (DO NOT SHARE!)
├── token.json              # Generated after first auth (DO NOT SHARE!)
├── temp_backups/           # Temporary download folder (auto-created)
├── logs/                   # Daily log files (auto-created)
│   └── backup_2025-11-26.log
└── README.md               # This file
```

---

## ⚙️ How It Works

### Regular Backups (Every 20 Minutes)
1. Checks Pterodactyl backup count
2. If limit reached, deletes oldest backup
3. Creates new backup
4. Waits for completion
5. Downloads backup file
6. Uploads to Google Drive main folder
7. Keeps last 3 backups in main folder
8. Deletes backup from Pterodactyl
9. Cleans up local temp file

### Daily Snapshots (11:59 PM IST)
1. All regular backup steps above, PLUS:
2. Uploads to "days" subfolder
3. Keeps last 5 daily backups
4. Deletes backups older than 5 days

---

## 🎛️ Customization

Edit these values in `index.js`:

```javascript
const config = {
  ptero: {
    maxBackupsOnServer: 2,    // Max backups on Pterodactyl
  },
  maxBackups: 3,              // Max backups in main folder
  maxDailyBackups: 5,         // Max daily snapshots (days)
  initialDelay: 30000,        // Wait time before checking (30s)
  pollInterval: 10000,        // Check interval (10s)
  pollTimeout: 900000,        // Max wait time (15 min)
};
```

**Change backup schedule** (default: every 20 minutes):

```javascript
cron.schedule('*/20 * * * *', async () => {
  await runBackupCycle();
}, {
  timezone: 'Asia/Kolkata'
});
```

Cron schedule examples:
- `*/20 * * * *` - Every 20 minutes
- `0 * * * *` - Every hour
- `0 */2 * * *` - Every 2 hours
- `0 0 * * *` - Every day at midnight

---


### 🥀Access Details


## 🏃 Running as a Service

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the script
pm2 start index.js --name pterodactyl-backup

# Auto-start on system boot
pm2 startup
pm2 save

# View logs
pm2 logs pterodactyl-backup

# Stop/restart
pm2 stop pterodactyl-backup
pm2 restart pterodactyl-backup
```

### Using systemd (Linux)

Create `/etc/systemd/system/ptero-backup.service`:

```ini
[Unit]
Description=Pterodactyl Auto Backup
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/pterodactyl-backup
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ptero-backup
sudo systemctl start ptero-backup
sudo systemctl status ptero-backup
```

---

## 📊 File Naming

### Main Folder
- Format: `DD-MMM-hA.tar.gz`
- Example: `26-Nov-11PM.tar.gz`

### Days Folder
- Format: `DD-MMM-YYYY.tar.gz`
- Example: `26-Nov-2025.tar.gz`

### Logs
- Format: `backup_YYYY-MM-DD.log`
- Example: `backup_2025-11-26.log`

---

## 🐛 Troubleshooting

### Error: "Missing required environment variables"
- Check your `.env` file exists
- Verify all variables are set
- No spaces around `=` sign

### Error: "Error loading credentials.json"
- Download OAuth credentials from Google Cloud Console
- Rename to `credentials.json`
- Place in project root folder

### Backup stuck at "Waiting for backup to complete"
- Increase `pollTimeout` in config
- Check Pterodactyl panel for errors
- Verify server has enough disk space

### Google Drive upload fails
- Delete `token.json` and re-authenticate
- Check folder IDs are correct
- Verify folders exist in Google Drive
- Check folder permissions

### Wrong timezone
- Script uses `Asia/Kolkata` (IST) by default
- Check system timezone doesn't override it
- Verify dayjs timezone plugin is working

---

## 🔒 Security Notes

**NEVER share or commit these files:**
- `.env` - Contains API keys
- `credentials.json` - Contains OAuth secrets
- `token.json` - Contains access tokens

Add to `.gitignore`:
```
.env
credentials.json
token.json
temp_backups/
logs/
node_modules/
```

---

## 📝 Logs

Daily log files are created in the `logs/` folder:

```
logs/
├── backup_2025-11-26.log
├── backup_2025-11-27.log
└── backup_2025-11-28.log
```

Each entry includes:
- Timestamp in IST
- Action performed
- Success/error messages
- File sizes

---

## 🤝 Support

If you encounter issues:

1. Check the logs in `logs/` folder
2. Verify all configuration steps
3. Test Pterodactyl API key manually
4. Ensure Google Drive folders are accessible
5. Check system has enough disk space

---

## 📜 License

MIT License - Free to use and modify

---

## 👤 Owner

**Blamingyt**

Created with ❤️ for the Pterodactyl community

---

## 🌟 Features Summary

| Feature | Description |
|---------|-------------|
| 🔄 Auto Backup | Every 30 minutes |
| 🌏 IST Timezone | Indian Standard Time |
| 📁 Main Storage | Last 3 backups |
| 📅 Daily Archive | Last 5 days at 11:59 PM |
| 🗑️ Auto Cleanup | Pterodactyl & Google Drive |
| 📝 Logging | Daily log files |
| 🔐 Secure | OAuth 2.0 authentication |

---

**Happy Backing Up! 🎉**
