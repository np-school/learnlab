// =========================================================
// NP-LearnLab — อัปโหลดไฟล์เอกสารขึ้น Google Drive (Shared Drive)
// เวอร์ชันนี้อัปโหลดผ่าน Firebase Storage แล้วให้ Cloud Function
// (functions/index.js) เป็นคนอัปขึ้น Drive จริงด้วย Service Account
// จึงไม่มีการขอ OAuth popup จากเบราว์เซอร์ครูอีกต่อไป — ใช้ได้แม้เปิด
// จากในแอป LINE/Facebook หรือเบราว์เซอร์ที่บล็อก popup
//
// ต้องตั้งค่าก่อนใช้งาน (ดู README หัวข้อ "ตั้งค่า Google Drive upload"):
// 1. อัปเกรดโปรเจกต์ Firebase เป็นแผน Blaze
// 2. เพิ่มอีเมล Service Account (<project-id>@appspot.gserviceaccount.com)
//    เป็นสมาชิก Shared Drive ปลายทาง (Content manager ขึ้นไป)
// 3. firebase deploy --only functions,storage
// =========================================================

// อัปโหลดไฟล์ 1 ไฟล์: เก็บที่ Storage ชั่วคราว → รอ Cloud Function อัปขึ้น Drive
// onProgress(percent:number) เรียกระหว่างอัปโหลดขึ้น Storage
// resolve({ id, name, webViewLink, mimeType, iconLink, size })
function uploadFileToDrive(file, onProgress) {
  const jobId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + "-" + Math.random().toString(16).slice(2));
  const path = "pending-uploads/" + jobId + "/" + file.name;
  const ref = storage.ref(path);

  return new Promise((resolve, reject) => {
    const task = ref.put(file);

    task.on("state_changed", (snap) => {
      if (onProgress && snap.totalBytes) {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      }
    }, (err) => {
      reject(new Error("อัปโหลดไม่สำเร็จ: " + err.message));
    }, () => {
      // อัปขึ้น Storage เสร็จแล้ว — รอ Cloud Function อัปขึ้น Drive ต่อ
      if (onProgress) onProgress(100);
      waitForDriveJob(jobId).then(resolve).catch(reject);
    });
  });
}

// รอผลลัพธ์จาก Cloud Function ผ่าน Firestore doc uploadJobs/{jobId}
// (เขียนโดย functions/index.js หลังอัปโหลดขึ้น Drive สำเร็จ/พลาด)
function waitForDriveJob(jobId, timeoutMs) {
  timeoutMs = timeoutMs || 60000;
  return new Promise((resolve, reject) => {
    let done = false;
    const unsub = db.collection("uploadJobs").doc(jobId).onSnapshot((doc) => {
      const data = doc.data();
      if (!data) return; // ยังไม่มี doc แปลว่า Function ยังไม่เริ่มทำงาน
      if (data.status === "done") {
        done = true; unsub(); clearTimeout(timer);
        resolve(data.driveFile);
      } else if (data.status === "error") {
        done = true; unsub(); clearTimeout(timer);
        reject(new Error(data.error || "อัปโหลดขึ้น Google Drive ไม่สำเร็จ"));
      }
    }, (err) => {
      done = true; unsub(); clearTimeout(timer);
      reject(new Error("ติดตามสถานะอัปโหลดไม่สำเร็จ: " + err.message));
    });
    const timer = setTimeout(() => {
      if (done) return;
      unsub();
      reject(new Error("อัปโหลดขึ้น Google Drive ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง"));
    }, timeoutMs);
  });
}
