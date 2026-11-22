import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedProfile } from "@/lib/supabase/verified-profile";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  try {
    // 1. Verify Authentication & Admin Role
    const client = await createClient();
    const { user, profile } = await getVerifiedProfile(client);
    if (!user || !profile || !profile.is_active || profile.role !== "admin") {
      return NextResponse.json(
        { error: "ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ" },
        { status: 403 }
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "ไม่พบไฟล์รูปภาพที่ต้องการอัปโหลด" },
        { status: 400 }
      );
    }

    // 3. Validation: MIME Type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP เท่านั้น" },
        { status: 400 }
      );
    }

    // 4. Validation: File Size (5MB limit)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      return NextResponse.json(
        { error: `ขนาดไฟล์ภาพต้องไม่เกิน 5MB (ขนาดไฟล์ปัจจุบัน: ${sizeMb}MB)` },
        { status: 400 }
      );
    }

    // 5. Generate filename
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `menu-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. Try uploading to Supabase Storage first
    try {
      const adminClient = createAdminClient();
      const { data, error } = await adminClient.storage
        .from("menu-images")
        .upload(filename, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (!error && data) {
        const { data: publicUrlData } = adminClient.storage
          .from("menu-images")
          .getPublicUrl(filename);

        if (publicUrlData?.publicUrl) {
          return NextResponse.json({
            url: publicUrlData.publicUrl,
            storage: "supabase",
          });
        }
      }
    } catch (storageErr) {
      console.warn("Supabase storage upload failed or not configured, using local fallback:", storageErr);
    }

    // 7. Fallback to local public/uploads/menus
    const uploadDir = path.join(process.cwd(), "public", "uploads", "menus");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({
      url: `/uploads/menus/${filename}`,
      storage: "local",
    });
  } catch (error) {
    console.error("Upload menu image failed:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
