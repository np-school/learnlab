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
courses/{id}/lessons/{lessonId} → { title, type: 'text'|'document', order: number,
                          content?,                       // HTML ที่ตกแต่งแล้ว (เฉพาะ type='text')
                          fileId?, fileName?, fileUrl?,    // ลิงก์ webViewLink บน Google Drive
                          fileMimeType?, fileIconLink?,    // (เฉพาะ type='document')
                          createdAt, updatedAt }
enrollments/{uid_courseId} → { uid, courseId, courseTitle, status: 'in_progress'|'completed',
                          progress: 0-100, certificateUrl?, enrolledAt, completedAt? }
```

> ไฟล์เอกสารจริงของเนื้อหาแบบ `document` ไม่ได้เก็บใน Firestore — อัปโหลดขึ้น **Google Drive
> (Shared Drive)** โดยตรงจากเบราว์เซอร์ผ่าน Drive API แล้วเก็บแค่ metadata (`fileId`, `fileUrl` ฯลฯ)
> ไว้ใน Firestore เท่านั้น

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

## ตั้งค่า Google Drive upload (สำหรับเนื้อหาแบบ "เอกสารแนบ")

`course-manage.html` อัปโหลดไฟล์เอกสารขึ้น Google Drive (Shared Drive) โดยตรงจากเบราว์เซอร์ของผู้สอน
(ไม่มี backend/Cloud Function) โดยใช้ Google Identity Services ขอสิทธิ์ scope
`drive.file` (เข้าถึงเฉพาะไฟล์ที่แอปนี้สร้างเอง) แยกจาก Firebase Auth ที่ใช้ล็อกอิน ต้องตั้งค่า
2 ค่าที่ `shared/drive-upload.js`:

1. **สร้าง OAuth 2.0 Client ID**
   - เปิด [Google Cloud Console](https://console.cloud.google.com/) → เลือก/สร้างโปรเจกต์
     (ใช้โปรเจกต์เดียวกับ Firebase ก็ได้ เพราะ Firebase สร้างบน Google Cloud อยู่แล้ว)
   - เปิดใช้งาน **Google Drive API**: APIs & Services → Library → ค้นหา "Google Drive API" → Enable
   - ไปที่ APIs & Services → Credentials → Create Credentials → **OAuth client ID**
     - Application type: **Web application**
     - Authorized JavaScript origins: ใส่โดเมนที่โฮสต์ไฟล์นี้ เช่น `https://your-domain.web.app`
       (และ `http://localhost:5000` ถ้าทดสอบในเครื่อง)
     - ไม่ต้องใส่ Authorized redirect URIs (ใช้ token flow ไม่ใช่ redirect flow)
   - คัดลอกค่า **Client ID** มาใส่แทน `YOUR_GOOGLE_OAUTH_CLIENT_ID...` ที่ตัวแปร `DRIVE_CLIENT_ID`
     ในไฟล์ `shared/drive-upload.js`
   - ถ้าโปรเจกต์ยังเป็น OAuth consent screen แบบ "Testing" ต้องเพิ่มอีเมลผู้สอนแต่ละคนเป็น
     **Test user** ก่อน ไม่งั้นจะขอสิทธิ์ไม่ผ่าน (หรือปรับ Publishing status เป็น In production)

2. **ใส่ Shared Drive Folder ID ปลายทาง**
   - เปิดโฟลเดอร์ปลายทางใน Shared Drive ด้วยเบราว์เซอร์ แล้วคัดลอกส่วนท้ายของ URL หลัง `/folders/`
     เช่น `https://drive.google.com/drive/folders/1AbCxEfG...` → ใช้ `1AbCxEfG...`
   - นำมาใส่แทน `YOUR_SHARED_DRIVE_FOLDER_ID` ที่ตัวแปร `DRIVE_SHARED_FOLDER_ID` ในไฟล์เดียวกัน
   - ตรวจสอบว่าบัญชี Google ที่ผู้สอนใช้ล็อกอิน (Gmail เดียวกับที่ใช้เข้า NP-LearnLab) เป็นสมาชิกของ
     Shared Drive นั้นอยู่แล้ว ด้วยสิทธิ์อย่างน้อย **Content manager** (อัปโหลด/สร้างไฟล์ได้)

เมื่อผู้สอนกดอัปโหลดไฟล์ครั้งแรก เบราว์เซอร์จะเด้งหน้าต่างยินยอม (consent) ของ Google ขึ้นมาให้กดอนุญาต
สิทธิ์ Drive ครั้งเดียว หลังจากนั้นจะขอ token ใหม่แบบเงียบๆ จนกว่า session จะหมดอายุ

## จุดที่ควรต่อยอด

- **course-manage.html** ตอนนี้มีระบบเพิ่ม/แก้ไข/ลบ/จัดลำดับเนื้อหาแบบข้อความ (ตกแต่งได้) และเอกสารแนบ
  (อัปโหลดขึ้น Google Drive) แล้ว — ยังไม่มีแบบทดสอบ (quiz) ภายในหลักสูตร และยังไม่มีหน้าเรียน
  (course player) ที่ผู้เรียนจะเห็นเนื้อหาเหล่านี้จริง — เป็นจุดต่อยอดถัดไป
- **เกียรติบัตร**: ยังไม่มีระบบออกเกียรติบัตรอัตโนมัติ ต้องเพิ่ม logic อัปเดต `certificateUrl` เมื่อ
  `progress` = 100 (คล้ายรูปแบบอัปโหลดไฟล์ผ่าน Cloud Function ของโปรเจกต์ NP-TCAS Verified)
- **ความคืบหน้า (progress)**: ตอนนี้ยังไม่มีหน้าเรียนจริงที่อัปเดตค่า progress — เป็นฟิลด์ตัวเลขเปล่าไว้ก่อน
  รอออกแบบหน้าคอร์สเพลเยอร์/บทเรียนในเวอร์ชันถัดไป (จะดึงเนื้อหาจาก `courses/{id}/lessons` ที่เพิ่งเพิ่ม)
