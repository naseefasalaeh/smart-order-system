"use client";

import { useState, useRef, useEffect, type ChangeEvent, type DragEvent } from "react";

type MenuImageUploaderProps = {
  initialImageUrl?: string | null;
  name?: string;
};

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export default function MenuImageUploader({
  initialImageUrl,
  name = "image_url",
}: MenuImageUploaderProps) {
  const [activeTab, setActiveTab] = useState<"file" | "url">("file");
  const [imageUrl, setImageUrl] = useState<string>(initialImageUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState<string>(initialImageUrl ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Disable submit buttons in the parent form while uploading
  useEffect(() => {
    if (!containerRef.current) return;
    const form = containerRef.current.closest("form");
    if (!form) return;

    const submitButtons = form.querySelectorAll<HTMLButtonElement>("button[type='submit']");
    if (isUploading) {
      submitButtons.forEach((btn) => {
        btn.dataset.uploadDisabled = btn.disabled ? "true" : "false";
        btn.disabled = true;
      });
    } else {
      submitButtons.forEach((btn) => {
        if (btn.dataset.uploadDisabled !== "true") {
          btn.disabled = false;
        }
        delete btn.dataset.uploadDisabled;
      });
    }
  }, [isUploading]);

  // Upload file function
  async function handleFileUpload(file: File) {
    setUploadError(null);

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError("รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WebP เท่านั้น");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate File Size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setUploadError(`ขนาดไฟล์ภาพต้องไม่เกิน 5MB (ไฟล์นี้มีขนาด ${sizeMb}MB)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Create local object URL for instant preview while uploading
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/menu-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }

      if (data.url) {
        setImageUrl(data.url);
        setPreviewUrl(data.url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ";
      setUploadError(msg);
      // Revert preview to previous URL if upload failed
      setPreviewUrl(imageUrl);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(localPreview);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  }

  function removeImage() {
    setImageUrl("");
    setPreviewUrl("");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Hidden input to pass final URL to the form */}
      <input type="hidden" name={name} value={imageUrl} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block font-semibold text-zinc-700">
          รูปภาพเมนูอาหาร
        </label>

        {/* Tab switch */}
        <div className="inline-flex rounded-xl bg-zinc-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "file"
                ? "bg-white text-orange-600 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2">
              <path d="M4 16h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L11 4H9L7.5 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Z" />
              <circle cx="10" cy="11" r="2.5" />
            </svg>
            อัปโหลดจากเครื่อง
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              activeTab === "url"
                ? "bg-white text-orange-600 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a4 4 0 0 0 4-4V7a4 4 0 0 0-8 0v2a4 4 0 0 0 4 4Z" />
              <path d="M7 10H5a3 3 0 0 0 0 6h6" />
              <path d="M13 10h2a3 3 0 0 0 0-6H9" />
            </svg>
            ใช้ลิงก์ URL
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        className="hidden"
      />

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="flex items-start justify-between rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-red-500">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-red-700"
            aria-label="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Image Container / Dropzone */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4">
        {previewUrl ? (
          /* Has Image: Preview Box */
          <div className="space-y-3">
            <div className="relative aspect-[16/10] w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-xs sm:aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="ตัวอย่างรูปภาพเมนู"
                className="h-full w-full object-cover"
              />

              {/* Uploading Spinner Overlay */}
              {isUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white backdrop-blur-xs">
                  <svg className="h-8 w-8 animate-spin text-orange-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <p className="mt-2 text-xs font-semibold">กำลังอัปโหลดรูปภาพ...</p>
                </div>
              )}
            </div>

            {/* Action Buttons: Change & Delete */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={activeTab === "file" ? openFilePicker : undefined}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-zinc-500" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {activeTab === "file" ? "เปลี่ยนรูปภาพจากเครื่อง" : "เปลี่ยน URL รูปภาพ"}
              </button>

              <button
                type="button"
                disabled={isUploading}
                onClick={removeImage}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-2 text-xs font-semibold text-red-700 shadow-2xs hover:bg-red-100 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-red-500" stroke="currentColor" strokeWidth="2">
                  <path d="M6 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7M4 7h12M8 7V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                ลบรูปภาพ
              </button>
            </div>
          </div>
        ) : (
          /* No Image: Empty Dropzone / Select Box */
          <div>
            {activeTab === "file" ? (
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={!isUploading ? openFilePicker : undefined}
                className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                  isDragging
                    ? "border-orange-500 bg-orange-50/50"
                    : "border-zinc-300 hover:border-orange-400 hover:bg-orange-50/30"
                } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 transition group-hover:scale-105">
                  {isUploading ? (
                    <svg className="h-6 w-6 animate-spin text-orange-600" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.75">
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                <p className="mt-3 text-sm font-semibold text-zinc-900">
                  {isUploading ? "กำลังอัปโหลดรูปภาพ..." : "คลิกเลือกรูปภาพ หรือลากไฟล์มาวางที่นี่"}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  รองรับไฟล์ภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 5MB
                </p>

                <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-orange-700">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
                  </svg>
                  เลือกรูปจากเครื่อง
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-8 text-center text-zinc-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-zinc-300" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="mt-2 text-xs">ยังไม่มีรูปภาพ กรุณาระบุ URL รูปภาพด้านล่าง</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: URL Input field (always accessible when on URL tab) */}
        {activeTab === "url" && (
          <div className="mt-4 border-t border-zinc-200/80 pt-4">
            <label htmlFor="image_url_text" className="mb-1.5 block text-xs font-semibold text-zinc-700">
              ระบุลิงก์รูปภาพ (Image URL)
            </label>
            <div className="flex gap-2">
              <input
                id="image_url_text"
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setImageUrl(val);
                  setPreviewUrl(val);
                  setUploadError(null);
                }}
                placeholder="https://images.unsplash.com/... หรือ URL รูปภาพอื่น ๆ"
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              />
              {imageUrl && (
                <button
                  type="button"
                  onClick={removeImage}
                  className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100"
                >
                  ล้างค่า
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              รองรับลิงก์รูปภาพสาธารณะ เช่น จาก Unsplash หรือเว็บโฮสต์รูปภาพ
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
