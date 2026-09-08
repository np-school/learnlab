// =========================================================
// NP-LearnLab — Cloud Function: อัปโหลดไฟล์ขึ้น Google Drive (Shared Drive)
// ทำงานฝั่งเซิร์ฟเวอร์ด้วย Service Account แทนการขอ OAuth จากเบราว์เซอร์ครู
// จึงไม่มีปัญหา popup ถูกบล็อก / เปิดใน in-app browser ไม่ได้อีก
//
// ขั้นตอนตั้งค่า (ดูละเอียดใน README เพิ่มเติมด้านล่าง):
// 1. เพิ่มอีเมล Service Account ของโปรเจกต์เป็นสมาชิก Shared Drive
//    (Content manager ขึ้นไป) — อีเมลรูปแบบ
//    <project-id>@appspot.gserviceaccount.com
// 2. ตั้งค่า DRIVE_SHARED_FOLDER_ID ด้านล่างให้ตรงกับของจริง
// 3. firebase deploy --only functions,storage
// =========================================================

const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");
const { Readable } = require("stream");

admin.initializeApp();

const DRIVE_SHARED_FOLDER_ID = "0AMfNDNABh-XBUk9PVA"; // แก้เป็นของจริง (เดียวกับที่เคยใช้ในโหมด client-side)
const UPLOAD_PREFIX = "pending-uploads/"; // ต้องตรงกับ path ที่ฝั่งเว็บอัปโหลดเข้ามา

exports.uploadToDrive = onObjectFinalized(
  {
    region: "us-east1",
    memory: "512MiB",
    timeoutSeconds: 300,
    serviceAccount: "uploadcourse@np-learnlab-508006.iam.gserviceaccount.com"
  },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || "";

    if (!filePath.startsWith(UPLOAD_PREFIX)) return; // ไม่ใช่ path ที่เราสนใจ ข้ามไป

    // รูปแบบ path: pending-uploads/{jobId}/{originalFileName}
    const parts = filePath.slice(UPLOAD_PREFIX.length).split("/");
    if (parts.length < 2) {
      logger.error("รูปแบบ path ไม่ถูกต้อง:", filePath);
      return;
    }
    const jobId = parts[0];
    const fileName = parts.slice(1).join("/");
    const jobRef = admin.firestore().collection("uploadJobs").doc(jobId);
    const bucket = admin.storage().bucket(obj.bucket);
    const storageFile = bucket.file(filePath);

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/drive"]
      });
      const drive = google.drive({ version: "v3", auth });

      const [buffer] = await storageFile.download();

      const res = await drive.files.create({
        requestBody: { name: fileName, parents: [DRIVE_SHARED_FOLDER_ID] },
        media: { mimeType: obj.contentType || "application/octet-stream", body: Readable.from(buffer) },
        fields: "id,name,webViewLink,webContentLink,mimeType,iconLink,size",
        supportsAllDrives: true
      });

      await jobRef.set({
        status: "done",
        driveFile: res.data,
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      logger.error("อัปโหลดขึ้น Drive ไม่สำเร็จ:", err);
      await jobRef.set({
        status: "error",
        error: err.message || String(err),
        finishedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } finally {
      // ลบไฟล์ชั่วคราวใน Storage ทิ้งไม่ว่าจะสำเร็จหรือพลาด
      await storageFile.delete().catch(() => {});
    }
  }
);
