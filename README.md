# 🚀 Pterodactyl Auto-Backup System

**Owner:** [Blamingyt](https://github.com/Blamingyt)

Automated backup solution for Pterodactyl game servers with Google Drive integration, intelligent backup management, and interactive restore functionality.

## ✨ Features

- 🔄 **Automated Backups**: Scheduled backups every 20 minutes
- 📅 **Daily Archives**: Separate daily backup folder (11:59 PM IST)
- 🧹 **Smart Cleanup**: Automatically manages backup limits on both Pterodactyl and Google Drive
- ⏰ **Indian Standard Time**: All timestamps in IST (Asia/Kolkata timezone)
- 📤 **Interactive Restore**: Upload backups from Google Drive back to your server
- 📊 **Detailed Logging**: Daily log files with complete operation history
- 🔐 **Secure OAuth**: Google Drive authentication using OAuth 2.0
- 💾 **Two-Tier Storage**: Main folder (3 backups) + Days folder (5 backups)

---

## 📋 Prerequisites

### For Node.js Version
- Node.js 14.x or higher
- npm or yarn

### For Python Version
- Python 3.8 or higher
- pip

### Common Requirements
- Pterodactyl Panel with API access
- Google Cloud Project with Drive API enabled
- OAuth 2.0 credentials from Google Cloud Console

---

## 🛠️ Installation

### Node.js Setup

1. **Clone or download the script**
```bash
mkdir pterodactyl-backup
cd pterodactyl-backup
```

2. **Install dependencies**
```bash
npm install dotenv axios node-cron googleapis dayjs form-data
```

3. **Create required files**
```bash
touch .env
# Place credentials.json in this directory
```

### Python Setup

1. **Clone or download the script**
```bash
mkdir pterodactyl-backup
cd pterodactyl-backup
```

2. **Install dependencies**
```bash
pip install requests schedule python-dotenv google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client pytz
```

3. **Create required files**
```bash
touch .env
# Place credentials.json in this directory
```

---

## 🔑 Google Cloud Setup

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google Drive API**
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### Step 2: Create OAuth Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Desktop app" as application type
4. Download the JSON file
5. Rename it to `credentials.json`
6. Place it in your project directory

### Step 3: Prepare Google Drive Folders
1. Create a main backup folder in Google Drive
2. Create a subfolder named "days" inside it
3. Get folder IDs from the URL:
   - Open folder in browser
   - URL format: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Copy the `FOLDER_ID_HERE` part

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project directory:

```env
# Pterodactyl Configuration
PTERO_API_KEY=ptlc_your_api_key_here
PTERO_PANEL_URL=https://panel.yourdomain.com
PTERO_SERVER_ID=your_server_identifier

# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=main_folder_id_from_drive_url
GOOGLE_DRIVE_DAYS_FOLDER_ID=days_subfolder_id_from_drive_url
```

### Getting Pterodactyl API Key
1. Login to your Pterodactyl Panel
2. Go to Account Settings > API Credentials
3. Create new API key
4. Copy the key (starts with `ptlc_`)

### Getting Server ID
1. Open your server in Pterodactyl Panel
2. Check the URL: `https://panel.yourdomain.com/server/SERVER_ID`
3. Copy the `SERVER_ID` portion

---

## 🚀 Usage

### Starting the Script

**Node.js:**
```bash
node backup_script.js
```

**Python:**
```bash
python backup_script.py
```

### First Run
On first run, the script will:
1. Open your browser for Google OAuth authorization
2. Ask you to sign in and grant permissions
3. Save authentication token to `token.json`
4. Start the initial backup
5. Schedule recurring backups

### Interactive Commands

Once running, you can type commands directly in the console:

#### Upload Command
Restore a backup from Google Drive to your server:
```bash
upload 1a2b3c4d5e6f7g8h9i0j
```

**How to get File ID:**
- Method 1: From Drive URL
  ```
  https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view
                                 ^^^^^^^^^^^^^^^^^^^^^^^^
                                 This is your File ID
  ```
- Method 2: Right-click file in Drive > "Get link" > Copy ID from URL

#### Help Command
Show available commands:
```bash
help
```

#### Exit Command
Gracefully stop the script:
```bash
exit
```

---

## 📅 Backup Schedule

### Regular Backups
- **Frequency**: Every 20 minutes
- **Location**: Main Google Drive folder
- **Retention**: Latest 3 backups
- **Naming**: `DD-MMM-HHPM.tar.gz` (e.g., `29-Nov-02PM.tar.gz`)

### Daily Backups
- **Time**: 11:59 PM IST
- **Location**: "days" subfolder
- **Retention**: Latest 5 backups
- **Naming**: `DD-MMM-YYYY.tar.gz` (e.g., `29-Nov-2025.tar.gz`)

---

## 📁 File Structure

```
pterodactyl-backup/
├── backup_script.js          # Node.js version
├── backup_script.py          # Python version
├── .env                      # Environment variables
├── credentials.json          # Google OAuth credentials
├── token.json               # Generated OAuth token (auto-created)
├── temp_backups/            # Temporary download folder
│   └── (temp files)
└── logs/                    # Daily log files
    ├── backup_2025-11-29.log
    └── backup_2025-11-30.log
```

---

## 🔄 How It Works

### Backup Process
1. **Check Pterodactyl**: Fetches existing backups
2. **Cleanup Old**: Deletes oldest backup if limit (3) is reached
3. **Create New**: Initiates new backup on Pterodactyl
4. **Wait for Completion**: Polls backup status every 10 seconds
5. **Download**: Downloads completed backup to temp folder
6. **Upload to Drive**: Uploads to Google Drive main folder
7. **Cleanup Drive**: Removes old backups exceeding limit
8. **Daily Archive**: If 11:59 PM, also uploads to "days" folder
9. **Cleanup**: Deletes backup from Pterodactyl and temp folder

### Restore Process
1. **Get File Info**: Fetches metadata from Google Drive
2. **Download**: Downloads backup to temp folder
3. **Upload to Server**: Uploads directly to Pterodactyl server files
4. **Cleanup**: Removes temp file

---

## 📊 Logging

### Log Files
- Created daily in `logs/` folder
- Named: `backup_YYYY-MM-DD.log`
- Includes timestamps in IST
- Logs all operations, errors, and status updates

### Log Levels
- `INFO`: Normal operations
- `ERROR`: Failures and exceptions

### Example Log Entry
```
[2025-11-29 14:30:15] 🕐 REGULAR Backup cycle started: 2025-11-29 14:30:15 IST
[2025-11-29 14:30:16] 📋 Fetching existing backups...
[2025-11-29 14:30:17] 📊 Found 2 existing backup(s) on Pterodactyl
[2025-11-29 14:30:18] 🚀 Creating new backup...
```

---

## 🛡️ Error Handling

The script handles various errors gracefully:

- **Network Issues**: Retries and logs errors
- **Authentication Failures**: Prompts for re-authorization
- **Backup Failures**: Cleans up partial files
- **Storage Limits**: Auto-manages backup counts
- **Timeout Protection**: 15-minute timeout for backups

---

## 🔧 Troubleshooting

### "Missing environment variables"
- Ensure `.env` file exists and contains all required variables
- Check for typos in variable names

### "Error loading credentials.json"
- Download OAuth credentials from Google Cloud Console
- Ensure file is named exactly `credentials.json`
- Place in same directory as script

### "Backup timeout exceeded"
- Large backups may take longer than 15 minutes
- Increase `POLL_TIMEOUT` in config section
- Check server performance and network speed

### "Failed to delete old backup"
- Check API key permissions
- Ensure API key has backup management access
- Verify server ID is correct

### Google Drive Quota Issues
- Check Google Drive storage space
- Free tier: 15 GB total storage
- Consider upgrading or cleaning old backups

### Permission Denied on Google Drive
- Re-authorize by deleting `token.json`
- Run script again to generate new token
- Ensure correct Google account has Drive access

---

## 🔐 Security Best Practices

1. **API Keys**: Never commit `.env` file to version control
2. **Token Storage**: Keep `token.json` secure and private
3. **File Permissions**: Set restrictive permissions on sensitive files
   ```bash
   chmod 600 .env credentials.json token.json
   ```
4. **OAuth Scopes**: Script only requests Drive file access (minimal scope)
5. **Regular Updates**: Keep dependencies updated for security patches

---

## 📈 Performance Tips

### For Large Servers
- Increase `INITIAL_DELAY` for large backups (default: 30 seconds)
- Adjust `POLL_INTERVAL` for checking status (default: 10 seconds)
- Consider increasing `POLL_TIMEOUT` beyond 15 minutes

### Network Optimization
- Run on server with good internet connection
- Consider running during off-peak hours
- Monitor bandwidth usage

### Storage Management
- Regularly review and clean old backups manually
- Adjust `MAX_BACKUPS` and `MAX_DAILY_BACKUPS` as needed
- Monitor Google Drive storage quota

---

## 🆘 Support

### Common Issues
- Check logs in `logs/` folder for detailed error messages
- Verify all API keys and credentials are valid
- Ensure Google Drive API is enabled in Cloud Console

### Getting Help
- Review error messages in console output
- Check log files for detailed operation history
- Verify Pterodactyl panel API access

---

## 📝 License

This project is provided as-is for personal and commercial use.

---

## 🙏 Credits

Built with:
- [Pterodactyl Panel](https://pterodactyl.io/) - Game server management
- [Google Drive API](https://developers.google.com/drive) - Cloud storage
- [Node.js](https://nodejs.org/) / [Python](https://www.python.org/) - Runtime environments

---

## 📌 Quick Start Checklist

- [ ] Install Node.js/Python and dependencies
- [ ] Create Google Cloud Project
- [ ] Enable Google Drive API
- [ ] Download OAuth credentials as `credentials.json`
- [ ] Create Google Drive folders (main + days)
- [ ] Get Pterodactyl API key
- [ ] Create `.env` file with all variables
- [ ] Run script and authorize Google account
- [ ] Verify first backup completes successfully
- [ ] Test restore command with backup file ID

---

**⭐ Tip**: Keep this README handy for reference. The script includes helpful console messages and logging to guide you through each operation!

**🔔 Note**: First run takes longer due to OAuth setup. Subsequent runs use saved token for instant access.
