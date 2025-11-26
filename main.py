import os
import sys
import time
import json
import requests
import schedule
from datetime import datetime
from pathlib import Path
import pytz
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ==================== CONFIGURATION ====================
class Config:
    # Pterodactyl settings
    PTERO_API_KEY = os.getenv('PTERO_API_KEY')
    PTERO_PANEL_URL = os.getenv('PTERO_PANEL_URL')
    PTERO_SERVER_ID = os.getenv('PTERO_SERVER_ID')
    
    # Google Drive settings
    GOOGLE_MAIN_FOLDER_ID = os.getenv('GOOGLE_DRIVE_FOLDER_ID')
    GOOGLE_DAYS_FOLDER_ID = os.getenv('GOOGLE_DRIVE_DAYS_FOLDER_ID')
    
    # Paths
    TEMP_DIR = Path(__file__).parent / 'temp_backups'
    LOGS_DIR = Path(__file__).parent / 'logs'
    CREDENTIALS_PATH = Path(__file__).parent / 'credentials.json'
    TOKEN_PATH = Path(__file__).parent / 'token.json'
    
    # Backup settings
    MAX_BACKUPS = 3
    MAX_DAILY_BACKUPS = 5
    INITIAL_DELAY = 30
    POLL_INTERVAL = 10
    POLL_TIMEOUT = 900
    
    # Timezone
    TIMEZONE = pytz.timezone('Asia/Kolkata')
    
    # Google OAuth scopes
    SCOPES = ['https://www.googleapis.com/auth/drive.file']

config = Config()

# ==================== LOGGING ====================
class Logger:
    def __init__(self):
        self.log_file = None
        self.ensure_logs_dir()
        self.init_log_file()
    
    def ensure_logs_dir(self):
        config.LOGS_DIR.mkdir(parents=True, exist_ok=True)
    
    def init_log_file(self):
        ist_now = datetime.now(config.TIMEZONE)
        log_filename = f"backup_{ist_now.strftime('%Y-%m-%d')}.log"
        log_path = config.LOGS_DIR / log_filename
        self.log_file = open(log_path, 'a', encoding='utf-8')
    
    def log(self, message, level='INFO'):
        ist_now = datetime.now(config.TIMEZONE)
        timestamp = ist_now.strftime('%Y-%m-%d %H:%M:%S')
        formatted_msg = f"[{timestamp}] {level}: {message}"
        
        print(formatted_msg)
        if self.log_file:
            self.log_file.write(formatted_msg + '\n')
            self.log_file.flush()
    
    def info(self, message):
        self.log(message, 'INFO')
    
    def error(self, message):
        self.log(message, 'ERROR')
    
    def close(self):
        if self.log_file:
            self.log_file.close()

logger = Logger()

# ==================== VALIDATION ====================
def validate_config():
    required = [
        'PTERO_API_KEY',
        'PTERO_PANEL_URL',
        'PTERO_SERVER_ID',
        'GOOGLE_DRIVE_FOLDER_ID'
    ]
    
    missing = [key for key in required if not os.getenv(key)]
    
    if missing:
        logger.error(f"❌ Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)
    
    if not config.GOOGLE_DAYS_FOLDER_ID:
        logger.info("⚠️  GOOGLE_DRIVE_DAYS_FOLDER_ID not set - daily backups feature disabled")

def ensure_temp_dir():
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"📁 Temp directory ready: {config.TEMP_DIR}")

# ==================== GOOGLE OAUTH ====================
def authorize_google():
    """Authorize and return Google Drive service"""
    creds = None
    
    # Load existing token
    if config.TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(config.TOKEN_PATH), config.SCOPES)
    
    # Refresh or get new credentials
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not config.CREDENTIALS_PATH.exists():
                logger.error("❌ Error: credentials.json not found")
                logger.error("Please download OAuth credentials from Google Cloud Console")
                sys.exit(1)
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(config.CREDENTIALS_PATH), config.SCOPES
            )
            creds = flow.run_local_server(port=0)
        
        # Save credentials
        with open(config.TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())
        logger.info(f"✅ Token saved to {config.TOKEN_PATH}")
    
    return build('drive', 'v3', credentials=creds)

# ==================== PTERODACTYL API ====================
class PterodactylClient:
    def __init__(self):
        self.base_url = f"{config.PTERO_PANEL_URL}/api/client"
        self.headers = {
            'Authorization': f'Bearer {config.PTERO_API_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    
    def get_all_backups(self):
        """Get all existing backups"""
        logger.info("📋 Fetching existing backups...")
        url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        backups = response.json()['data']
        logger.info(f"📊 Found {len(backups)} existing backup(s) on Pterodactyl")
        return backups
    
    def delete_oldest_backup_if_needed(self):
        """Delete oldest backup if limit is reached"""
        backups = self.get_all_backups()
        
        if len(backups) >= 3:
            logger.info("⚠️  Backup limit reached, deleting oldest backup...")
            
            # Sort by created date (oldest first)
            sorted_backups = sorted(
                backups,
                key=lambda x: x['attributes']['created_at']
            )
            
            oldest_backup = sorted_backups[0]
            backup_id = oldest_backup['attributes']['uuid']
            
            url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups/{backup_id}"
            response = requests.delete(url, headers=self.headers)
            response.raise_for_status()
            logger.info(f"✅ Deleted oldest backup: {backup_id}")
    
    def create_backup(self):
        """Create a new backup"""
        self.delete_oldest_backup_if_needed()
        
        logger.info("🚀 Creating new backup...")
        url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups"
        response = requests.post(url, headers=self.headers)
        response.raise_for_status()
        
        backup_id = response.json()['attributes']['uuid']
        logger.info(f"✅ Backup created: {backup_id}")
        return backup_id
    
    def wait_for_completion(self, backup_id):
        """Wait for backup to complete"""
        logger.info("⏳ Waiting for backup to complete...")
        time.sleep(config.INITIAL_DELAY)
        
        start_time = time.time()
        check_count = 0
        
        while True:
            check_count += 1
            elapsed = int(time.time() - start_time)
            
            if elapsed > config.POLL_TIMEOUT:
                raise Exception("Backup timeout exceeded")
            
            url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups/{backup_id}"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            
            backup = response.json()['attributes']
            
            status = 'In Progress'
            if backup['is_successful'] is True:
                status = 'Success'
            elif backup['is_successful'] is False:
                status = 'Failed'
            
            logger.info(f"   Check #{check_count} ({elapsed}s) - Status: {status}")
            
            if backup['is_successful'] is True and backup['completed_at']:
                logger.info("✅ Backup completed!")
                return backup
            
            if backup['is_successful'] is None or (backup['is_successful'] is False and elapsed <= 60):
                time.sleep(config.POLL_INTERVAL)
                continue
            
            if backup['is_successful'] is False:
                raise Exception("Backup failed on server")
    
    def get_download_url(self, backup_id):
        """Get backup download URL"""
        logger.info("🔗 Getting download URL...")
        url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups/{backup_id}/download"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        
        download_url = response.json()['attributes']['url']
        logger.info("✅ Download URL obtained")
        return download_url
    
    def delete_backup(self, backup_id):
        """Delete backup from Pterodactyl"""
        logger.info("🗑️  Deleting backup from Pterodactyl...")
        try:
            url = f"{self.base_url}/servers/{config.PTERO_SERVER_ID}/backups/{backup_id}"
            response = requests.delete(url, headers=self.headers)
            response.raise_for_status()
            logger.info("✅ Backup deleted from Pterodactyl")
        except Exception as e:
            logger.error(f"⚠️  Failed to delete backup: {str(e)}")

# ==================== FILE OPERATIONS ====================
def download_backup(download_url, local_path):
    """Download backup file"""
    logger.info("⬇️  Downloading backup...")
    
    response = requests.get(download_url, stream=True, timeout=600)
    response.raise_for_status()
    
    with open(local_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    file_size = os.path.getsize(local_path) / 1024 / 1024
    logger.info(f"✅ Download complete: {file_size:.2f} MB")
    return local_path

# ==================== GOOGLE DRIVE OPERATIONS ====================
def upload_to_drive(drive_service, local_path, folder_id, filename):
    """Upload file to Google Drive"""
    logger.info(f"☁️  Uploading to Google Drive ({filename})...")
    
    file_metadata = {
        'name': filename,
        'parents': [folder_id]
    }
    
    media = MediaFileUpload(
        str(local_path),
        mimetype='application/gzip',
        resumable=True
    )
    
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, name, createdTime'
    ).execute()
    
    file_size = os.path.getsize(local_path) / 1024 / 1024
    logger.info(f"✅ Uploaded: {filename} ({file_size:.2f} MB)")
    return file

def cleanup_old_backups(drive_service, folder_id, max_backups):
    """Remove old backups from Google Drive"""
    logger.info(f"🧹 Cleaning up old backups (max: {max_backups})...")
    
    results = drive_service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, createdTime)",
        orderBy="createdTime desc"
    ).execute()
    
    files = results.get('files', [])
    logger.info(f"📊 Found {len(files)} backup(s) in folder")
    
    if len(files) > max_backups:
        files_to_delete = files[max_backups:]
        logger.info(f"🗑️  Deleting {len(files_to_delete)} old backup(s)...")
        
        for file in files_to_delete:
            drive_service.files().delete(fileId=file['id']).execute()
            logger.info(f"   ✅ Deleted: {file['name']}")

# ==================== BACKUP CYCLE ====================
def run_backup_cycle(is_daily_backup=False):
    """Run complete backup cycle"""
    ist_now = datetime.now(config.TIMEZONE)
    backup_type = "DAILY" if is_daily_backup else "REGULAR"
    
    logger.info("\n" + "=" * 60)
    logger.info(f"🕐 {backup_type} Backup cycle started: {ist_now.strftime('%Y-%m-%d %H:%M:%S')} IST")
    logger.info("=" * 60)
    
    backup_id = None
    local_path = None
    
    try:
        # Initialize clients
        ptero = PterodactylClient()
        drive_service = authorize_google()
        
        # Create and download backup
        backup_id = ptero.create_backup()
        ptero.wait_for_completion(backup_id)
        download_url = ptero.get_download_url(backup_id)
        
        # Download to temp file
        temp_filename = f"backup_{ist_now.strftime('%Y-%m-%d_%H-%M-%S')}.tar.gz"
        local_path = config.TEMP_DIR / temp_filename
        download_backup(download_url, local_path)
        
        # Upload to main folder
        main_filename = ist_now.strftime('%d-%b-%I%p').upper() + '.tar.gz'
        upload_to_drive(drive_service, local_path, config.GOOGLE_MAIN_FOLDER_ID, main_filename)
        cleanup_old_backups(drive_service, config.GOOGLE_MAIN_FOLDER_ID, config.MAX_BACKUPS)
        
        # Upload to daily folder if applicable
        if is_daily_backup and config.GOOGLE_DAYS_FOLDER_ID:
            logger.info("\n📅 Uploading daily backup to 'days' folder...")
            daily_filename = ist_now.strftime('%d-%b-%Y') + '.tar.gz'
            upload_to_drive(drive_service, local_path, config.GOOGLE_DAYS_FOLDER_ID, daily_filename)
            cleanup_old_backups(drive_service, config.GOOGLE_DAYS_FOLDER_ID, config.MAX_DAILY_BACKUPS)
        
        # Cleanup
        ptero.delete_backup(backup_id)
        
        if local_path.exists():
            local_path.unlink()
            logger.info("🗑️  Local file deleted")
        
        logger.info("✅ Backup cycle completed!")
        
    except Exception as e:
        logger.error(f"❌ Backup failed: {str(e)}")
        
        # Cleanup on error
        if backup_id:
            ptero = PterodactylClient()
            ptero.delete_backup(backup_id)
        
        if local_path and local_path.exists():
            local_path.unlink()
    
    logger.info("=" * 60 + "\n")

# ==================== SCHEDULING ====================
def job_regular_backup():
    """Scheduled job for regular backups"""
    run_backup_cycle(is_daily_backup=False)

def job_daily_backup():
    """Scheduled job for daily backups"""
    run_backup_cycle(is_daily_backup=True)

# ==================== MAIN ====================
def main():
    logger.info("\n🎯 Pterodactyl Auto-Backup (Python Version)\n")
    
    # Validate and setup
    validate_config()
    ensure_temp_dir()
    
    logger.info("⚙️  Configuration:")
    logger.info(f"   Panel: {config.PTERO_PANEL_URL}")
    logger.info(f"   Server: {config.PTERO_SERVER_ID}")
    logger.info(f"   Main Folder: {config.GOOGLE_MAIN_FOLDER_ID}")
    logger.info(f"   Days Folder: {config.GOOGLE_DAYS_FOLDER_ID or 'Not configured'}")
    logger.info(f"   Max Backups (Main): {config.MAX_BACKUPS}")
    logger.info(f"   Max Backups (Daily): {config.MAX_DAILY_BACKUPS}")
    logger.info(f"   Timezone: Asia/Kolkata (IST)\n")
    
    # Initialize Google Drive
    logger.info("🔐 Initializing Google Drive...")
    authorize_google()
    logger.info("✅ Google Drive ready!\n")
    
    # Run initial backup
    logger.info("🚀 Running initial backup...")
    run_backup_cycle()
    
    # Schedule regular backups (every 20 minutes)
    schedule.every(20).minutes.do(job_regular_backup)
    logger.info("✅ Regular backup scheduled: Every 20 minutes (IST)")
    
    # Schedule daily backup (11:59 PM IST)
    if config.GOOGLE_DAYS_FOLDER_ID:
        schedule.every().day.at("23:59").do(job_daily_backup)
        logger.info("✅ Daily backup scheduled: 11:59 PM IST")
    
    logger.info("📝 Press Ctrl+C to stop\n")
    
    # Run scheduler
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("\n🛑 Shutting down...")
        logger.close()
        sys.exit(0)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"💥 Fatal error: {str(e)}")
        logger.close()
        sys.exit(1)
