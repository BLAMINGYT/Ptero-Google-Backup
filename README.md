# 🚀 Pterodactyl Auto-Backup to Google Drive

**Owner:** [Blamingyt](https://github.com/Blamingyt)

Automatically backup your Pterodactyl game server to Google Drive with intelligent rotation and Indian Standard Time support.

## ✨ Features

- ✅ **Automatic Pterodactyl backup management** - Deletes oldest backup when limit reached
- ✅ **Dual-folder system** - Regular backups + daily archive
- ✅ **Indian Standard Time (IST)** - All timestamps in Asia/Kolkata timezone
- ✅ **Smart rotation** - Keeps only the latest backups (configurable)
- ✅ **No OAuth hassle** - Uses Google Service Account (fully automated)
- ✅ **Detailed logging** - Daily log files with complete audit trail
- ✅ **Error recovery** - Automatic cleanup on failures

## 📋 Table of Contents

- [Requirements](#requirements)
- [Google Cloud Setup](#google-cloud-setup)
- [Installation (Node.js)](#installation-nodejs)
- [Installation (Python)](#installation-python)
- [Configuration](#configuration)
- [Running the Script](#running-the-script)
- [Backup Schedule](#backup-schedule)
- [Folder Structure](#folder-structure)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Requirements

### For Node.js Version
- Node.js 14 or higher
- npm or yarn

### For Python Version
- Python 3.7 or higher
- pip

### Common Requirements
- Pterodactyl Panel with API access
- Google Cloud account (free tier works fine)
- Google Drive with two folders created

---

## 🌐 Google Cloud Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a Project** → **New Project**
3. Enter project name (e.g., `pterodactyl-backup`)
4. Click **Create**

### Step 2: Enable Google Drive API

1. In the Google Cloud Console, search for **"Drive API"**
2. Click **Google Drive API**
3. Click **Enable**

### Step 3: Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Enter details:
   - **Name**: `pterodactyl-backup`
   - **Description**: Service account for automated backups
4. Click **Create and Continue**
5. **Skip** the "Grant access" section → Click **Continue**
6. **Skip** the "Grant users access" section → Click **Done**

### Step 4: Generate Service Account Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create New Key**
4. Select **JSON** format
5. Click **Create**
6. **Save the downloaded file as `service-account.json`** in your project directory

### Step 5: Create Google Drive Folders

1. Open [Google Drive](https://drive.google.com/)
2. Create a main folder (e.g., `Pterodactyl Backups`)
3. Inside that folder, create a subfolder named `days`
4. Copy both folder IDs:
   - Open the folder
   - Look at the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Copy the `FOLDER_ID_HERE` part

### Step 6: Share Folders with Service Account

**⚠️ CRITICAL STEP - Don't skip this!**

1. Open the `service-account.json` file
2. Find the `client_email` field (looks like `xxxxx@xxxxx.iam.gserviceaccount.com`)
3. Copy this email address
4. In Google Drive, for **BOTH** folders:
   - Right-click the folder → **Share**
   - Paste the service account email
   - Change permission to **Editor**
   - Uncheck "Notify people"
   - Click **Share**

---

## 📦 Installation (Node.js)

### 1. Clone or Download

```bash
# Create project directory
mkdir pterodactyl-backup
cd pterodactyl-backup
```

### 2. Install Dependencies

```bash
npm init -y
npm install dotenv axios node-cron googleapis dayjs
```

### 3. Create Files

Create `index.js` with the provided Node.js code.

### 4. Setup Environment

Create `.env` file:

```env
# Pterodactyl Configuration
PTERO_API_KEY=your_pterodactyl_api_key_here
PTERO_PANEL_URL=https://panel.yourdomain.com
PTERO_SERVER_ID=your_server_identifier

# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=main_folder_id_from_drive
GOOGLE_DRIVE_DAYS_FOLDER_ID=days_subfolder_id_from_drive
```

### 5. Add Service Account File

Place your `service-account.json` in the project directory.

### 6. Run

```bash
node index.js
```

---

## 🐍 Installation (Python)

### 1. Clone or Download

```bash
# Create project directory
mkdir pterodactyl-backup
cd pterodactyl-backup
```

### 2. Install Dependencies

```bash
pip install requests schedule python-dotenv google-auth google-api-python-client pytz
```

Or using `requirements.txt`:

Create `requirements.txt`:
```txt
requests>=2.28.0
schedule>=1.1.0
python-dotenv>=0.20.0
google-auth>=2.16.0
google-api-python-client>=2.70.0
pytz>=2022.7
```

Then install:
```bash
pip install -r requirements.txt
```

### 3. Create Files

Create `backup.py` with the provided Python code.

### 4. Setup Environment

Create `.env` file:

```env
# Pterodactyl Configuration
PTERO_API_KEY=your_pterodactyl_api_key_here
PTERO_PANEL_URL=https://panel.yourdomain.com
PTERO_SERVER_ID=your_server_identifier

# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=main_folder_id_from_drive
GOOGLE_DRIVE_DAYS_FOLDER_ID=days_subfolder_id_from_drive
```

### 5. Add Service Account File

Place your `service-account.json` in the project directory.

### 6. Run

```bash
python backup.py
```

---

## ⚙️ Configuration

### Getting Pterodactyl API Key

1. Log into your Pterodactyl panel
2. Go to **Account Settings** → **API Credentials**
3. Click **Create New**
4. Give it a description (e.g., "Backup Script")
5. Copy the generated API key
6. **Important**: Copy it immediately - you won't see it again!

### Getting Server ID

1. Go to your server in Pterodactyl panel
2. Look at the URL: `https://panel.yourdomain.com/server/SERVER_ID`
3. Copy the `SERVER_ID` part

### Adjustable Settings

You can modify these in the script:

```javascript
// Node.js (in config object)
maxBackups: 3,              // Max backups in main folder
maxDailyBackups: 5,         // Max backups in days folder
initialDelay: 30000,        // Wait time after backup creation (30s)
pollInterval: 10000,        // Check interval for backup completion (10s)
pollTimeout: 900000,        // Max wait time for backup (15 min)
```

```python
# Python (in Config class)
MAX_BACKUPS = 3              # Max backups in main folder
MAX_DAILY_BACKUPS = 5        # Max backups in days folder
INITIAL_DELAY = 30           # Wait time after backup creation (30s)
POLL_INTERVAL = 10           # Check interval for backup completion (10s)
POLL_TIMEOUT = 900           # Max wait time for backup (15 min)
```

---

## 📅 Backup Schedule

### Regular Backups
- **Frequency**: Every 20 minutes
- **Location**: Main Google Drive folder
- **Retention**: Latest 3 backups
- **Filename Format**: `26-NOV-11PM.tar.gz`

### Daily Backups
- **Frequency**: Daily at 11:59 PM IST
- **Location**: Days subfolder
- **Retention**: Latest 5 days
- **Filename Format**: `26-Nov-2025.tar.gz`

### Automatic Rotation

The script automatically:
1. Deletes oldest Pterodactyl backup when limit reached (before creating new)
2. Keeps only the latest 3 backups in main folder
3. Keeps only the latest 5 daily backups in days folder
4. Deletes backup from Pterodactyl after successful upload

---

## 📁 Folder Structure

```
pterodactyl-backup/
├── index.js / backup.py       # Main script
├── .env                        # Environment variables
├── service-account.json        # Google service account credentials
├── package.json               # Node.js dependencies (if using Node)
├── requirements.txt           # Python dependencies (if using Python)
├── temp_backups/              # Temporary download location (auto-created)
└── logs/                      # Daily log files (auto-created)
    ├── backup_2025-11-26.log
    ├── backup_2025-11-27.log
    └── ...
```

### Google Drive Structure

```
Pterodactyl Backups/          # Main folder
├── 26-NOV-11PM.tar.gz        # Regular backups (keeps 3)
├── 26-NOV-01PM.tar.gz
├── 26-NOV-03AM.tar.gz
└── days/                      # Days subfolder
    ├── 26-Nov-2025.tar.gz    # Daily backups (keeps 5)
    ├── 27-Nov-2025.tar.gz
    ├── 28-Nov-2025.tar.gz
    ├── 29-Nov-2025.tar.gz
    └── 30-Nov-2025.tar.gz
```

---

## 🐛 Troubleshooting

### "Missing required environment variables"

**Solution**: Check your `.env` file has all required variables set correctly.

### "Service account file not found"

**Solution**: Make sure `service-account.json` is in the same directory as the script.

### "Failed to initialize Google Drive"

**Solutions**:
1. Verify `service-account.json` is valid JSON
2. Check you've enabled Google Drive API in Google Cloud Console
3. Ensure the service account email has Editor access to both folders

### "Backup limit reached" but no backups visible

**Solution**: Check if backups exist in Pterodactyl panel. The script checks for 3+ backups before creating new ones.

### Uploads failing with 404 error

**Solution**: 
1. Verify folder IDs are correct
2. Confirm service account has Editor access to folders
3. Check folders haven't been moved or deleted

### Wrong timezone in logs

**Solution**: Script uses Asia/Kolkata (IST) timezone. If you need different timezone, modify:

**Node.js**:
```javascript
dayjs.tz.setDefault('Asia/Kolkata');  // Change timezone here
```

**Python**:
```python
TIMEZONE = pytz.timezone('Asia/Kolkata')  # Change timezone here
```

### Script stops after error

**Solution**: The script includes error recovery and will continue running. Check logs for details. Common issues:
- Network timeouts (will retry next cycle)
- Pterodactyl backup failures (cleans up and tries next time)
- Google Drive quota exceeded (upgrade storage or reduce retention)

---

## 🔐 Security Best Practices

1. **Never commit** `.env` or `service-account.json` to version control
2. Add to `.gitignore`:
   ```
   .env
   service-account.json
   temp_backups/
   logs/
   ```
3. Keep API keys secure and rotate periodically
4. Use service account with minimum required permissions
5. Regularly review Google Drive shared folder access

---

## 🚀 Running as a Service

### Linux (systemd)

Create `/etc/systemd/system/pterodactyl-backup.service`:

**For Node.js**:
```ini
[Unit]
Description=Pterodactyl Backup Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/pterodactyl-backup
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**For Python**:
```ini
[Unit]
Description=Pterodactyl Backup Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/pterodactyl-backup
ExecStart=/usr/bin/python3 backup.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pterodactyl-backup
sudo systemctl start pterodactyl-backup
sudo systemctl status pterodactyl-backup
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: "At system startup"
4. Action: "Start a program"
   - **Node.js**: `C:\Program Files\nodejs\node.exe`
   - **Python**: `C:\Python3\python.exe`
5. Add arguments: Full path to your script
6. Set working directory to script location

---

## 📊 Monitoring

### Check Logs

```bash
# View today's log
tail -f logs/backup_$(date +%Y-%m-%d).log

# View all logs
ls -lh logs/
```

### Verify Backups

1. Check Google Drive folders for uploaded files
2. Verify file sizes are reasonable
3. Check log files for "✅ Backup cycle completed!"

---

## 📝 License

This project is provided as-is for personal and commercial use.

---

## 🤝 Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review log files in the `logs/` directory
3. Verify all configuration steps were completed
4. Ensure Google Drive API quotas haven't been exceeded

---

## 🎉 Credits

Built with:
- [Pterodactyl Panel](https://pterodactyl.io/)
- [Google Drive API](https://developers.google.com/drive)
- Node.js: axios, node-cron, googleapis, dayjs
- Python: requests, schedule, google-api-python-client, pytz

---

**Happy Backing Up! 🚀**
