# 7 — IMPORT / EXPORT

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Classification

```text
Full Module
Priority: P2
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้างมาตรฐานกลางสำหรับ:

```text
parse imported data
validate rows
normalize errors
serialize exported data
```

โดยไม่ผูกกับ:

```text
database
business schema
file storage
UI
```

Architecture:

```text
Input File/Data
      ↓
Import / Export Core
      ↓
Parser / Serializer
      ↓
Validated Generic Records
      ↓
Host Business Logic
```

---

## Important Boundary

Import Module **ไม่เขียน database เอง**

Flow:

```text
Import Module
→ parse + validate
→ Host receives records
→ Host decides database writes
```

File Storage เป็นคนจัดการไฟล์

Import/Export เป็นคนจัดการ data format

Job/Retry เป็นคนจัดการ background execution ถ้าจำเป็น

---

## v0.1 Formats

รองรับ:

```text
CSV
JSON
```

ก่อน

ห้ามทำพร้อมกัน:

```text
XLSX
XML
PDF
Google Sheets
database dump
```

จนมี use case จริง

---

## Import API Concept

```ts
importData({
  format,
  input,
  validator,
  transform?,
  options?
})
```

---

## Imported Record

```ts
type ImportedRecord<T = Record<string, unknown>> = {
  row: number

  value?: T

  valid: boolean

  errors?: ImportRowError[]
}
```

---

## Import Result

```ts
type ImportResult<T> = {
  total: number
  accepted: number
  rejected: number

  records: ImportedRecord<T>[]

  errors?: ImportError[]
}
```

---

## Validator

Host เป็นเจ้าของ business schema

Concept:

```ts
interface RecordValidator<T> {
  validate(record: unknown): ValidationResult<T>
}
```

Import/Export Module ห้าม hard-code schema เช่น:

```text
customer
shop
booking
product
```

---

## Transform

รองรับ optional Host transform:

```text
trim strings
normalize dates
rename fields
convert type
```

แต่ transformation rules เป็น Host input

Core ไม่เดาธุรกิจ

---

## CSV Rules

ต้องกำหนด behavior ชัดสำหรับ:

```text
header row
duplicate headers
missing headers
empty lines
quoted commas
quoted newline
UTF-8
BOM
```

ใช้ mature CSV parser

ห้าม implement parser ด้วย `split(",")`

---

## JSON Rules

v0.1 รองรับอย่างน้อย:

```text
JSON array of objects
```

เช่น:

```json
[
  {},
  {}
]
```

ไม่ต้องรองรับ arbitrary nested migration format โดยอัตโนมัติ

---

## Export API

Concept:

```ts
exportData({
  format,
  records,
  columns?,
  options?
})
```

คืน:

```ts
type ExportResult = {
  contentType: string
  filenameExtension: string

  data: string | Uint8Array

  recordCount: number
}
```

---

## Column Ordering

CSV export ต้อง deterministic

ถ้า Host ส่ง:

```text
columns
```

ใช้ order นั้น

ห้าม rely กับ random object key ordering สำหรับ public export contract

---

## CSV Injection Protection

Export ต้องมี safe mode สำหรับ spreadsheet formula injection

ค่าที่ขึ้นต้นเช่น:

```text
=
+
-
@
```

ต้องสามารถ escape ตาม documented policy

ห้าม silently execute spreadsheet formulas

---

## Size Limits

v0.1 ควรมี configurable:

```text
max input bytes
max rows
max columns
max field length
```

เพื่อป้องกัน memory abuse

ถ้าเกิน:

```text
reject ก่อน processing เพิ่ม
```

---

## Streaming

v0.1 ไม่ต้องสร้าง streaming architecture เต็มรูปแบบถ้ายังไม่มี use case

แต่ MODULE.md ต้องประกาศ limitation ชัด:

```text
bounded in-memory import/export
```

เมื่อมี large-data use case ค่อยเพิ่ม:

```text
stream parser
AsyncIterable
batch processor
```

โดยไม่ breaking existing contract

---

## Partial Failure

Import ต้องรองรับ:

```text
valid rows
invalid rows
```

ในไฟล์เดียวกัน

Module ไม่เป็นคนตัดสินว่า Host ควร:

```text
accept partial
หรือ
reject whole import
```

Host เป็นคนตัดสินผ่าน policy

---

## Error Contract

ระดับไฟล์:

```text
IMPORT_FORMAT_INVALID
IMPORT_SIZE_EXCEEDED
IMPORT_PARSE_FAILED
IMPORT_HEADER_INVALID
EXPORT_FAILED
FORMAT_UNSUPPORTED
```

ระดับ row:

```text
ROW_INVALID
FIELD_REQUIRED
FIELD_INVALID
TRANSFORM_FAILED
```

---

## Security

ต้องป้องกัน:

```text
CSV formula injection
oversized input
malformed parser bombs
prototype pollution
unsafe object keys
unexpected executable content
secret leakage in exported metadata
```

Module ไม่ execute imported code/macros

---

## Out of Scope

```text
database writes
database transaction
file upload/storage
background jobs
XLSX v0.1
PDF
Google Sheets API
data migration engine
ETL platform
schema auto-detection AI
duplicate business-record detection
UI import wizard
```

---

## Tests

```text
valid CSV
quoted comma
quoted newline
UTF-8
BOM
duplicate header
missing required mapped field
invalid row
mixed valid/invalid rows
valid JSON
invalid JSON
oversized input
row limit
transform success
transform failure
CSV export
JSON export
column ordering
CSV formula injection
empty export
unsupported format
```

---

## Definition of Done

```text
[ ] Generic record contract
[ ] CSV import
[ ] JSON import
[ ] CSV export
[ ] JSON export
[ ] Host validator injection
[ ] Optional transform
[ ] Partial row errors
[ ] Input limits
[ ] CSV injection protection
[ ] No database dependency
[ ] Tests
[ ] Examples
[ ] MODULE.md
[ ] VERSION
```

---
