# NP-LearnLab

ระบบอบรม/เรียนออนไลน์ — ใช้ชุดดีไซน์และสถาปัตยกรรมเดียวกับ NP-TCAS Verified
(แยกไฟล์ตามหน้า ใช้ Firebase Auth (Google) + Firestore ใช้เมนู/สไตล์ร่วมกันผ่านโฟลเดอร์ `shared/`)

## บทบาทผู้ใช้ (roles)

ผู้ใช้ทุกคนมี role `user` โดยอัตโนมัติเมื่อล็อกอินครั้งแรก และสามารถมี role เพิ่มได้พร้อมกันหลายอัน:

| role | ใครได้ | เข้าเมนูอะไร |
|---|---|---|
| `user` | ทุกคนที่ล็อกอิน | หน้าแรก, ข้อมูลส่วนตัว, การอบรมของฉัน, หลักสูตรการอบรมทั้งหมด |
| `instructor` | ผู้ใช้ที่ถูกมอบสิทธิ์จากเจ้าหน้าที่ | หลักสูตรที่เป็นเจ้าของ, หลักสูตรการอบรม (จัดการ/สร้าง) |
| `staff` | ผู้ใช้ที่ถูกมอบสิทธิ์จากเจ้าหน้าที่ หรือ super admin | แดชบอร์ดระบบ, หลักสูตรการอบรม (จัดการทั้งหมด), ผู้ใช้งาน |

**Super admin เริ่มต้น:** `nattapol@nongki.ac.th` — ได้สิทธิ์ `staff` อัตโนมัติเสมอ (hardcode ไว้ที่
`shared/firebase-init.js` ตัวแปร `SUPER_ADMIN_EMAIL` และใน `firestore.rules`) ใช้เพื่อเข้าไปมอบสิทธิ์
ให้ผู้ใช้คนอื่นต่อในหน้า `admin-users.html` โดยไม่ต้องสร้างเอกสารแรกมือใน Console

ผู้ใช้ที่มีมากกว่า 1 role จะเห็นแถบสลับกลุ่มเมนู ("role-switch") ที่ใต้ navbar ของทุกหน้า

## หน้าทั้งหมด (แยกไฟล์ตามหน้า)

| ไฟล์ | กลุ่มเมนู | ทำอะไร |
|---|---|---|
| `index.html` | ทุกคน | ล็อกอิน Google แล้วพาไปหน้า onboarding หรือ dashboard อัตโนมัติ |
| `onboarding.html` | ทุกคน (ล็อกอินครั้งแรก) | กรอกข้อมูลส่วนตัวก่อนเริ่มใช้งาน |
| `dashboard.html` | user | แดชบอร์ดผู้ใช้ทั่วไป — สรุปหลักสูตรที่สมัคร/เรียนจบ/กำลังเรียน |
| `profile.html` | user | แก้ไขข้อมูลส่วนตัว |
| `my-courses.html` | user | รายการหลักสูตรที่สมัคร พร้อมความคืบหน้า และลิงก์เกียรติบัตร (เมื่อเรียนจบ) |
| `courses.html` | user | เรียกดู/สมัครหลักสูตรที่เปิดรับสมัครทั้งหมด |
| `instructor-courses.html` | instructor | รายการหลักสูตรที่ตัวเองเป็นเจ้าของ |
| `course-manage.html` | instructor | สร้าง/แก้ไขข้อมูลพื้นฐานของหลักสูตร + เพิ่ม/จัดลำดับเนื้อหา (ข้อความ/เอกสารแนบผ่าน Google Drive) |
| `admin-dashboard.html` | staff | แดชบอร์ดภาพรวมทั้งระบบ |
| `admin-courses.html` | staff | จัดการ/เปลี่ยนสถานะหลักสูตรทั้งหมดในระบบ |
| `admin-users.html` | staff | ค้นหาผู้ใช้งานทั้งหมด และมอบสิทธิ์ instructor/staff |

ทุกหน้าโหลด `shared/firebase-init.js` + `shared/auth-guard.js` + `shared/menu.js` เหมือนกัน แล้วเรียก
`guardPage(['role ที่อนุญาต'], callback)` เพื่อเช็คสิทธิ์ก่อนแสดงเนื้อหา จากนั้นเรียก
`renderShell(group, activeHref, profile)` เพื่อวาด sidebar + role-switch จากไฟล์เมนูกลางเดียว
(`shared/menu.js`) — แก้เมนูที่ไฟล์นี้ที่เดียว มีผลทุกหน้า

## โครงสร้างข้อมูล (Firestore)

```
users/{uid}          → { name, email, phone, organization, position,
                          photoURL, roles: ['user'|'instructor'|'staff', ...],
                          onboarded: boolean, createdAt }
courses/{id}          → { title, description, category, status: 'draft'|'published',
                          ownerUid, ownerName, createdAt, updatedAt }
courses/{id}/lessons/{lessonId} → { title, type: 'text'|'document'|'quiz', order: number,
                          content?,                       // HTML ที่ตกแต่งแล้ว (เฉพาะ type='text')
                          fileId?, fileName?, fileUrl?,    // ลิงก์ webViewLink บน Google Drive
                          fileMimeType?, fileIconLink?,    // (เฉพาะ type='document')
                          questions?, passScore?,          // เฉพาะ type='quiz' (ดูรายละเอียดด้านล่าง)
                          createdAt, updatedAt }
enrollments/{uid_courseId} → { uid, courseId, courseTitle, status: 'in_progress'|'completed',
                          progress: 0-100, quizAttempts?, certificateUrl?, enrolledAt, completedAt? }
```

### แบบทดสอบ (quiz lesson)

ผู้สอนเลือกได้เองว่าจะวางแบบทดสอบไว้ตรงไหนในหลักสูตร — จะทำเป็นชุดเดียวท้ายหลักสูตร (final exam)
หรือแนบท้ายแต่ละบทเรียนก็ได้ เพราะ quiz เป็นแค่ lesson อีกประเภทหนึ่งที่จัดลำดับ/ย้ายตำแหน่งได้เหมือน
เนื้อหาข้อความ/เอกสารแนบทุกประการ

```
courses/{id}/lessons/{lessonId}  (type: 'quiz')
  questions: [
    { text: string, options: string[2-6], correct: number }  // index ของตัวเลือกที่ถูก
  ]
  passScore: number  // เกณฑ์ผ่านเป็น % (ตั้งได้ต่อชุด ค่าเริ่มต้น 70)
```

สร้าง/แก้ไขได้ในหน้า `course-manage.html` (ปุ่ม "เพิ่มแบบทดสอบ")

**เงื่อนไขจบหลักสูตร (สร้างแล้วในหน้า `course-player.html`):**
- ผู้เรียนทำแบบทดสอบซ้ำได้ไม่จำกัดจำนวนครั้ง จนกว่าจะได้คะแนนถึง `passScore` ของชุดนั้น
- แต่ละบทเรียน (ข้อความ/เอกสาร/แบบทดสอบที่ผ่านแล้ว) จะถูกบันทึกไว้ที่ `enrollments.completedLessonIds`
  และคำนวณ `progress` เป็น % จากสัดส่วนบทที่เรียนจบแล้วเทียบทั้งหมดในหลักสูตร
- หลักสูตรจะนับว่า "เรียนจบ" (`enrollments.status = 'completed'`) เมื่อทำครบทุกบทในหลักสูตรนั้น
```

> ไฟล์เอกสารจริงของเนื้อหาแบบ `document` (รวมถึงไฟล์รูปภาพ) ไม่ได้เก็บใน Firestore — อัปโหลดขึ้น
> **Google Drive (Shared Drive)** โดยตรงจากเบราว์เซอร์ผ่าน Drive API แล้วเก็บแค่ metadata (`fileId`,
> `fileUrl` ฯลฯ) ไว้ใน Firestore เท่านั้น — ฝั่งหน้าเว็บใช้ `fileMimeType` เพื่อแยกไอคอน/ป้ายกำกับว่าเป็น
> รูปภาพหรือเอกสารทั่วไปเท่านั้น ไม่มีการ preview รูปจริงในหน้าเว็บ (ต้องกดลิงก์ไปดูที่ Drive)
>
> **รูปปกหลักสูตร** (`coverUrl`) ก็อัปโหลดผ่าน pipeline เดียวกันนี้ (ขึ้น Google Drive โฟลเดอร์
> เดียวกับไฟล์เนื้อหาของหลักสูตรนั้น) ต่างจากไฟล์เอกสารทั่วไปตรงที่ Cloud Function จะตั้งสิทธิ์ไฟล์
> เป็น "ดูได้ทุกคนที่มีลิงก์" แล้วคำนวณ `imageUrl` (ลิงก์ thumbnail ของ Drive) เก็บเป็น `coverUrl` ใน
> Firestore เพื่อให้ฝัง `<img>` แสดงตัวอย่างในหน้ารายการหลักสูตร/หน้าเรียนได้ทันทีโดยไม่ต้องล็อกอิน

> เกียรติบัตร (`certificateUrl`) ยังเป็นฟิลด์เปล่าไว้ก่อน — เดี๋ยวเพิ่มระบบออกเกียรติบัตรอัตโนมัติเมื่อ
> `progress` ถึง 100% ในเวอร์ชันถัดไปตามที่ตกลงไว้

## ขั้นตอนติดตั้ง

1. สร้างโปรเจกต์ Firebase ใหม่ที่ https://console.firebase.google.com
2. เปิดใช้ **Authentication → Sign-in method → Google**
3. เปิดใช้ **Firestore Database** (โหมด production)
4. คัดลอกค่า config จาก Project settings → General → Your apps → Web app มาใส่ใน
   `shared/firebase-init.js` แทนค่า `YOUR_...`
5. Deploy security rules: Firestore Database → แท็บ Rules → วางเนื้อหาจาก `firestore.rules` → Publish
   (หรือใช้ `firebase deploy --only firestore:rules` ถ้าติดตั้ง Firebase CLI)
6. ล็อกอินด้วยอีเมล `nattapol@nongki.ac.th` ครั้งแรก — จะได้สิทธิ์ staff อัตโนมัติ ใช้เข้า
   `admin-users.html` เพื่อมอบสิทธิ์ instructor/staff ให้คนอื่นต่อได้เลย
7. โฮสต์ไฟล์ทั้งหมดด้วย Firebase Hosting / GitHub Pages หรือ static host ใดก็ได้ แล้วเพิ่มโดเมนนั้นใน
   Authentication → Settings → Authorized domains ไม่งั้น popup ล็อกอินจะ error

## ตั้งค่า Google Drive upload (สำหรับ "เอกสารแนบ" และ "รูปปกหลักสูตร")

`course-manage.html` อัปโหลดไฟล์เอกสาร**และรูปปกหลักสูตร**ผ่าน **Firebase Storage** ก่อน แล้ว
**Cloud Function** (`functions/index.js`) เป็นคนอัปโหลดไฟล์นั้นต่อขึ้น Google Drive (Shared Drive)
ด้วย **Service Account** ของโปรเจกต์เอง — ผู้สอนจึงไม่ต้องขอสิทธิ์ Google Drive ผ่าน popup
บนเบราว์เซอร์อีกต่อไป (ใช้งานได้แม้เปิดจากในแอป LINE/Facebook หรือเบราว์เซอร์ที่บล็อก popup)

ต้องตั้งค่าดังนี้:

1. **อัปเกรดโปรเจกต์ Firebase เป็นแผน Blaze** (Cloud Functions ใช้แผน Spark ไม่ได้ —
   มี free quota ต่อเดือนให้อยู่แล้ว งานสเกลเล็กแบบนี้ปกติไม่เสียค่าใช้จ่าย)
2. **เปิดใช้งาน Google Drive API** ในโปรเจกต์ Google Cloud เดียวกับ Firebase:
   APIs & Services → Library → ค้นหา "Google Drive API" → Enable
3. **เพิ่ม Service Account เป็นสมาชิก Shared Drive ปลายทาง**
   - อีเมล Service Account เริ่มต้นของ Firebase คือ `<project-id>@appspot.gserviceaccount.com`
     (เช่น `np-learnlab@appspot.gserviceaccount.com`) — เช็คชื่อเต็มได้ที่ Google Cloud Console →
     IAM & Admin → Service Accounts
   - เปิด Shared Drive ปลายทาง → Manage members → เพิ่มอีเมลนี้เป็นสมาชิก สิทธิ์อย่างน้อย
     **Content manager**
4. **ตั้งค่า Folder ID ปลายทาง** ที่ตัวแปร `DRIVE_SHARED_FOLDER_ID` ในไฟล์
   `functions/index.js` (คัดลอกส่วนท้ายของ URL โฟลเดอร์ปลายทาง)
5. **ติดตั้งและ deploy**
   ```bash
   cd functions && npm install
   cd ..
   firebase deploy --only functions,firestore:rules,storage
   ```

กลไกเบื้องหลัง: เบราว์เซอร์ครูอัปโหลดไฟล์ไปที่ `pending-uploads/{jobId}/{courseId}/{kind}/{ชื่อไฟล์}`
ใน Firebase Storage (ต้องล็อกอินเท่านั้น อ่านไฟล์กลับไม่ได้ — `kind` คือ `lesson` สำหรับเอกสารแนบ
หรือ `cover` สำหรับรูปปกหลักสูตร) → Cloud Function ที่ trigger จาก Storage event ดาวน์โหลดไฟล์นั้น
แล้วอัปขึ้นโฟลเดอร์ Drive ของหลักสูตรนั้น (สร้างโฟลเดอร์อัตโนมัติถ้ายังไม่มี, แคช `driveFolderId`
ไว้ที่ `courses/{id}`) ผ่าน Drive API — ถ้าเป็นรูปปก (`kind=cover`) จะตั้งสิทธิ์ไฟล์เป็น "ดูได้ทุกคน
ที่มีลิงก์" เพิ่มด้วย แล้วคำนวณลิงก์ thumbnail เป็น `imageUrl` — สุดท้ายเขียนผลลัพธ์ลง Firestore ที่
`uploadJobs/{jobId}` → หน้าเว็บ listen (`onSnapshot`) รอผลแล้วลบไฟล์ชั่วคราวใน Storage ทิ้ง

## จุดที่ควรต่อยอด

- **course-manage.html** มีระบบเพิ่ม/แก้ไข/ลบ/จัดลำดับเนื้อหาแบบข้อความ (ตกแต่งได้), เอกสารแนบ/รูปปก
  (อัปโหลดขึ้น Google Drive), และแบบทดสอบ (quiz พร้อมเกณฑ์ผ่านต่อชุด) แล้ว
- **course-player.html** มีหน้าเรียนให้ผู้เรียนดูเนื้อหาแต่ละบท/ทำแบบทดสอบ/ทำเครื่องหมายเรียนจบ
  และคำนวณ `progress`/`status` ของ `enrollments` ให้อัตโนมัติแล้ว — จุดต่อยอดที่เหลือ:
  - แสดงรูปภาพ preview จริงสำหรับเนื้อหาแบบ `document` ที่เป็นไฟล์รูป (ตอนนี้ต้องกดลิงก์ไปดูที่ Drive)
  - เก็บประวัติการทำ quiz แต่ละครั้งไว้ที่ `enrollments.quizAttempts` (ตอนนี้เก็บแค่ผลล่าสุด/สถานะผ่าน)
- **เกียรติบัตร**: ยังไม่มีระบบออกเกียรติบัตรอัตโนมัติ ต้องเพิ่ม logic อัปเดต `certificateUrl` เมื่อ
  `status` เปลี่ยนเป็น `completed` (คล้ายรูปแบบอัปโหลดไฟล์ผ่าน Cloud Function ของโปรเจกต์ NP-TCAS Verified)
