// =========================================================
// NP-LearnLab — อัปโหลดไฟล์เอกสารขึ้น Google Drive (Shared Drive)
// ใช้ Google Identity Services (GIS) ขอ access token แยกจาก Firebase Auth
// เพราะ Firebase Google Sign-In ไม่ได้ขอสิทธิ์ Drive มาด้วยตั้งแต่ล็อกอิน
//
// วิธีตั้งค่า (ดูขั้นตอนละเอียดใน README.md หัวข้อ "ตั้งค่า Google Drive upload"):
// 1. สร้าง OAuth 2.0 Client ID (Web application) ที่ Google Cloud Console
//    แล้วนำมาใส่แทนค่า DRIVE_CLIENT_ID ด้านล่าง
// 2. เปิดใช้งาน Google Drive API ในโปรเจกต์เดียวกัน
// 3. ใส่ Folder ID ของโฟลเดอร์ปลายทางใน Shared Drive ที่ DRIVE_SHARED_FOLDER_ID
//    (เปิดโฟลเดอร์ใน Drive แล้วคัดลอกส่วนท้ายของ URL หลัง /folders/)
// =========================================================

const DRIVE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";
const DRIVE_SHARED_FOLDER_ID = "YOUR_SHARED_DRIVE_FOLDER_ID";

// ขอสิทธิ์แบบจำกัดเฉพาะไฟล์ที่แอปนี้สร้าง/เปิดเอง (ไม่แตะไฟล์อื่นใน Drive ของผู้ใช้)
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let driveTokenClient = null;
let driveAccessToken = null;
let driveTokenExpiry = 0;

function driveConfigured() {
  return DRIVE_CLIENT_ID.indexOf("YOUR_") !== 0 && DRIVE_SHARED_FOLDER_ID.indexOf("YOUR_") !== 0;
}

// ขอ / ใช้ access token เดิมถ้ายังไม่หมดอายุ
function ensureDriveToken() {
  return new Promise((resolve, reject) => {
    if (!driveConfigured()) {
      reject(new Error("ยังไม่ได้ตั้งค่า Google Drive (DRIVE_CLIENT_ID / DRIVE_SHARED_FOLDER_ID) ใน shared/drive-upload.js"));
      return;
    }
    if (driveAccessToken && Date.now() < driveTokenExpiry - 30000) {
      resolve(driveAccessToken);
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      reject(new Error("โหลด Google Identity Services ไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"));
      return;
    }
    if (!driveTokenClient) {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {} // จะถูกตั้งใหม่ทุกครั้งที่เรียกด้านล่าง
      });
    }
    driveTokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error("ขอสิทธิ์เข้าถึง Google Drive ไม่สำเร็จ: " + resp.error)); return; }
      driveAccessToken = resp.access_token;
      driveTokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      resolve(driveAccessToken);
    };
    // ครั้งแรกให้ผู้ใช้กดยินยอม (consent) ครั้งต่อไปขอ token เงียบๆ ถ้ายังไม่หมดอายุ session
    driveTokenClient.requestAccessToken({ prompt: driveAccessToken ? "" : "consent" });
  });
}

// อัปโหลดไฟล์ 1 ไฟล์ขึ้นโฟลเดอร์ปลายทางใน Shared Drive
// onProgress(percent:number) เรียกระหว่างอัปโหลด (ถ้ามี)
// resolve({ id, name, webViewLink, mimeType, iconLink, size })
function uploadFileToDrive(file, onProgress) {
  return ensureDriveToken().then(token => {
    const metadata = {
      name: file.name,
      parents: [DRIVE_SHARED_FOLDER_ID]
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      // supportsAllDrives=true จำเป็นเสมอเมื่ออัปโหลดเข้า Shared Drive
      xhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink,mimeType,iconLink,size");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else if (xhr.status === 401) {
          // token หมดอายุ/ถูกเพิกถอนกลางทาง — เคลียร์ไว้ให้ครั้งหน้าขอใหม่
          driveAccessToken = null;
          reject(new Error("สิทธิ์เข้าถึง Google Drive หมดอายุ กรุณาลองอัปโหลดใหม่อีกครั้ง"));
        } else {
          reject(new Error("อัปโหลดไม่สำเร็จ (HTTP " + xhr.status + ")"));
        }
      };
      xhr.onerror = () => reject(new Error("อัปโหลดไม่สำเร็จ: เครือข่ายขัดข้อง"));
      xhr.send(form);
    });
  });
}
