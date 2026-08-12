# MODULE 2 — File Storage

## Objective

สร้าง abstraction กลางสำหรับจัดการไฟล์ เพื่อให้ Host Project ใช้ API เดียว โดยไม่ผูกกับ Storage Provider

```text
Host
 ↓
File Storage Core
 ↓
Storage Adapter
 ├── Cloudflare R2
 └── Supabase Storage
```

---

## Public API

ขั้นต่ำ:

```ts
upload()
delete()
getUrl()
getMetadata()
exists()
```

ตัวอย่าง concept:

```ts
storage.upload({
  file,
  path,
  contentType,
  metadata
})
```

---

## Core Contract

### Upload Request

```ts
type UploadRequest = {
  file: Blob | ArrayBuffer
  filename: string
  contentType: string

  directory?: string

  metadata?: Record<string, string>
}
```

### Upload Result

```ts
type UploadResult = {
  success: boolean

  key?: string
  url?: string
  size?: number
  contentType?: string

  error?: StorageError
}
```

---

## Validation

ต้องรองรับ:

- maximum file size
- MIME allowlist
- filename sanitization
- safe directory/path
- empty file rejection
- unsupported file type rejection

---

## Path Generation

สร้าง helper กลางสำหรับ safe object key เช่น:

```text
uploads/{year}/{month}/{uuid}.jpg
```

ห้ามใช้ filename จาก user เป็น path ตรงๆ

---

## Adapters

### v0.1

Implement ก่อน:

```text
Cloudflare R2 Adapter
```

### v0.2

เพิ่ม:

```text
Supabase Storage Adapter
```

---

## Security

ต้องป้องกัน:

- path traversal
- dangerous filename
- spoofed extension
- oversized upload
- secret leak
- public URL โดยไม่ได้ตั้งใจ

Core ห้าม assume ว่าไฟล์ทุกไฟล์ public

ต้องรองรับ concept:

```text
public
private
```

---

## Out of Scope

v0.1 ห้ามทำ:

- image processing
- thumbnails
- video transcoding
- CDN management
- database file catalog
- virus scanner
- resumable upload

---

## Tests

อย่างน้อย:

```text
valid upload
invalid MIME
oversized file
empty file
filename sanitization
path traversal
upload failure
delete success
delete missing file
provider failure
```

---

## Definition of Done

```text
[ ] Core ไม่รู้จัก R2
[ ] R2 Adapter implement จริง
[ ] Config inject จาก host
[ ] File validation
[ ] Safe path
[ ] Standard errors
[ ] Unit tests
[ ] Adapter tests
[ ] Example integration
[ ] MODULE.md
[ ] typecheck ผ่าน
[ ] tests ผ่าน
```

---
