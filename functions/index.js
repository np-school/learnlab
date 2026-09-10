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

// ทำชื่อให้ปลอดภัยสำหรับใช้เป็นชื่อโฟลเดอร์/ไฟล์บน Drive
// (ตัดอักขระที่มีปัญหา เช่น / ซึ่ง Drive ตีความเป็นตัวคั่นพาธ, จำกัดความยาว)
function sanitizeName(s) {
  return (s || "").toString().replace(/[\/\\]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}

// หา/สร้างโฟลเดอร์ของหลักสูตรนี้บน Shared Drive แล้วคืนค่า folderId
// ลำดับการหา: 1) ใช้ driveFolderId ที่แคชไว้ใน courses/{courseId} ถ้ามี
//            2) ค้นหาโฟลเดอร์ชื่อเดียวกันใต้ DRIVE_SHARED_FOLDER_ID (เผื่อเคยสร้างไว้แต่แคชหาย)
//            3) สร้างใหม่ แล้วเขียน driveFolderId กลับไปแคชไว้ที่เอกสารหลักสูตร
async function getOrCreateCourseFolder(drive, courseId, course) {
  if (course.driveFolderId) return course.driveFolderId;

  const folderName = sanitizeName(
    [course.code, course.title, course.ownerName].filter(Boolean).join(" - ")
  ) || `course-${courseId}`;

  const q = [
    `name = '${folderName.replace(/'/g, "\\'")}'`,
    `'${DRIVE_SHARED_FOLDER_ID}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ].join(" and ");

  const found = await drive.files.list({
    q,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    pageSize: 1
  });

  let folderId;
  if (found.data.files && found.data.files.length) {
    folderId = found.data.files[0].id;
  } else {
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [DRIVE_SHARED_FOLDER_ID]
      },
      fields: "id",
      supportsAllDrives: true
    });
    folderId = created.data.id;
  }

  await admin.firestore().collection("courses").doc(courseId)
    .set({ driveFolderId: folderId }, { merge: true })
    .catch(() => {}); // แคชไม่สำเร็จก็ไม่เป็นไร ครั้งหน้าจะค้นหาซ้ำแทน

  return folderId;
}

exports.uploadToDrive = onObjectFinalized(
  {
    region: "us-east1",
    memory: "512MiB",
    timeoutSeconds: 300
    // ใช้ default compute service account ของโปรเจกต์ (ไม่ต้องขอสิทธิ์ actAs เพิ่ม)
    // ต้องเพิ่มอีเมล 111321772789-compute@developer.gserviceaccount.com
    // เป็นสมาชิก Shared Drive แทน uploadcourse@...
  },
  async (event) => {
    const obj = event.data;
    const filePath = obj.name || "";

    if (!filePath.startsWith(UPLOAD_PREFIX)) return; // ไม่ใช่ path ที่เราสนใจ ข้ามไป

    // รูปแบบ path: pending-uploads/{jobId}/{courseId}/{kind}/{originalFileName}
    // courseId เป็น "_" หมายถึงไม่ผูกกับหลักสูตรใด (อัปขึ้นโฟลเดอร์รากตามเดิม)
    // kind: "lesson" = เอกสารแนบเนื้อหา, "cover" = รูปปกหลักสูตร,
    //       "image" = รูปภาพที่แทรกในเนื้อหาข้อความ, "video" = ไฟล์วิดีโอที่อัปโหลดตรง
    //       (ทั้งหมดไปอยู่โฟลเดอร์ Drive ของหลักสูตรเดียวกัน)
    const parts = filePath.slice(UPLOAD_PREFIX.length).split("/");
    if (parts.length < 4) {
      logger.error("รูปแบบ path ไม่ถูกต้อง:", filePath);
      return;
    }
    const jobId = parts[0];
    const courseId = decodeURIComponent(parts[1]);
    const KNOWN_KINDS = ["cover", "image", "video"];
    const kind = KNOWN_KINDS.includes(parts[2]) ? parts[2] : "lesson";
    const fileName = parts.slice(3).join("/");
    const jobRef = admin.firestore().collection("uploadJobs").doc(jobId);
    const bucket = admin.storage().bucket(obj.bucket);
    const storageFile = bucket.file(filePath);

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/drive"]
      });
      const drive = google.drive({ version: "v3", auth });

      // หาโฟลเดอร์ปลายทาง: แยกตามหลักสูตรถ้ามี courseId มิฉะนั้นใช้โฟลเดอร์รากตามเดิม
      let parentId = DRIVE_SHARED_FOLDER_ID;
      if (courseId && courseId !== "_") {
        const courseSnap = await admin.firestore().collection("courses").doc(courseId).get();
        if (courseSnap.exists) {
          parentId = await getOrCreateCourseFolder(drive, courseId, courseSnap.data());
        } else {
          logger.error("ไม่พบหลักสูตร courseId=" + courseId + " — อัปขึ้นโฟลเดอร์รากแทน");
        }
      }

      const [buffer] = await storageFile.download();

      const res = await drive.files.create({
        requestBody: { name: fileName, parents: [parentId] },
        media: { mimeType: obj.contentType || "application/octet-stream", body: Readable.from(buffer) },
        fields: "id,name,webViewLink,webContentLink,mimeType,iconLink,thumbnailLink,size",
        supportsAllDrives: true
      });

      const driveFile = res.data;

      // รูปปกหลักสูตร / รูปภาพแทรกในเนื้อหา / วิดีโออัปโหลด: เปิดสิทธิ์ "ดูได้ทุกคนที่มีลิงก์"
      // เพื่อให้ฝัง <img src="..."> หรือ <iframe src="..."> แสดง/เล่นได้ทันทีโดยไม่ต้องล็อกอิน
      // (ไฟล์เอกสารแนบทั่วไป kind="lesson" ยังคงจำกัดสิทธิ์ตามเดิม ต้องเปิดผ่าน webViewLink ที่มีการล็อกอิน)
      if (kind === "cover" || kind === "image" || kind === "video") {
        try {
          await drive.permissions.create({
            fileId: driveFile.id,
            requestBody: { role: "reader", type: "anyone" },
            supportsAllDrives: true
          });
        } catch (permErr) {
          logger.error("ตั้งค่าสิทธิ์เปิดสาธารณะไม่สำเร็จ (kind=" + kind + "):", permErr);
        }
        if (kind === "video") {
          // ใช้ Drive preview viewer แบบฝัง iframe ได้ (รองรับ seek/streaming แบบพื้นฐาน)
          driveFile.embedUrl = "https://drive.google.com/file/d/" + driveFile.id + "/preview";
        } else {
          driveFile.imageUrl = (driveFile.thumbnailLink || "").replace(/=s\d+$/, "=s1600") ||
            ("https://drive.google.com/uc?export=view&id=" + driveFile.id);
        }
      }

      await jobRef.set({
        status: "done",
        driveFile,
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
