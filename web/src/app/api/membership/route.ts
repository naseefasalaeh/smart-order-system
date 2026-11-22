import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberAges, memberCookie, memberGenders, normalizePhone, validateMemberPassword } from "@/lib/member-input";
import { hashMemberPassword, verifyMemberPassword } from "@/lib/member-auth";

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }
  const token = (await cookies()).get(memberCookie)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { error } = await createAdminClient().rpc("revoke_member_device", {
      p_hash: createHash("sha256").update(token).digest("hex"),
    });
    if (error) return NextResponse.json({ error: "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
  const response = NextResponse.json({ message: "ออกจากระบบเรียบร้อยแล้ว" });
  response.cookies.delete(memberCookie);
  return response;
}

export async function GET() {
  const token = (await cookies()).get(memberCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    const response = NextResponse.json({ state: "guest" }, { headers: { "Cache-Control": "no-store" } });
    if (token) response.cookies.delete(memberCookie);
    return response;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  // Check if active member
  const { data: profile, error } = await admin.rpc("get_member_profile", { p_hash: tokenHash });
  if (error) {
    return NextResponse.json({ error: "โหลดสถานะสมาชิกไม่สำเร็จ" }, { status: 503 });
  }

  if (profile && profile.length > 0) {
    const m = profile[0];
    return NextResponse.json(
      {
        state: "member",
        member: {
          id: m.id,
          memberCode: m.member_code,
          phone: m.phone,
          gender: m.gender,
          age: m.age_range,
          promotions: m.promotion_consent,
          createdAt: m.created_at,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Auto-upgrade any device associated with an existing member
  const { data: dev } = await admin
    .from("member_devices")
    .select("active, members(id, member_code, phone, gender, age_range, promotion_consent, created_at)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();

  if (dev && dev.members) {
    const memData = Array.isArray(dev.members) ? dev.members[0] : dev.members;
    // Activate device immediately
    await admin
      .from("member_devices")
      .update({ active: true, reviewed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);

    return NextResponse.json(
      {
        state: "member",
        member: {
          id: memData?.id,
          memberCode: memData?.member_code,
          phone: memData?.phone,
          gender: memData?.gender,
          age: memData?.age_range,
          promotions: memData?.promotion_consent,
          createdAt: memData?.created_at,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json({ state: "guest" }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.delete(memberCookie);
  return response;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const action = body?.action || (body?.isLogin ? "login" : "enroll");

    // ------------------------------------------------------------------
    // LOGIN (Phone number & Password)
    // ------------------------------------------------------------------
    if (action === "login") {
      const phone = normalizePhone(body?.phone);
      if (!phone) {
        return NextResponse.json({ error: "กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้อง (เช่น 0812345678)" }, { status: 400 });
      }

      const inputPassword = typeof body?.password === "string" ? body.password.trim() : "";
      const admin = createAdminClient();

      // Look up member to verify password
      const { data: memberRows, error: lookupErr } = await admin.rpc("member_get_by_phone", { p_phone: phone });
      if (lookupErr || !memberRows || memberRows.length === 0) {
        return NextResponse.json(
          { error: "ไม่พบข้อมูลสมาชิกสำหรับเบอร์นี้ กรุณาสมัครสมาชิกก่อนเข้าสู่ระบบ" },
          { status: 404 }
        );
      }

      const memberRow = memberRows[0];
      // If member has password set, verify it
      if (memberRow.password_hash) {
        if (!inputPassword || !verifyMemberPassword(inputPassword, memberRow.password_hash)) {
          return NextResponse.json(
            {
              error: "รหัสผ่านไม่ถูกต้อง หากลืมรหัสผ่านสามารถแจ้งพนักงานที่ร้านเพื่อรีเซ็ตรหัสผ่านได้ครับ",
              isWrongPassword: true,
            },
            { status: 401 }
          );
        }
      }

      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const { data: loginData, error: loginErr } = await admin.rpc("member_login", {
        p_phone: phone,
        p_hash: tokenHash,
      });

      if (loginErr || !loginData || loginData.length === 0) {
        return NextResponse.json({ error: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 503 });
      }

      const m = loginData[0];
      // Ensure active device in database
      await admin
        .from("member_devices")
        .update({ active: true, reviewed_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);

      const response = NextResponse.json({
        state: "member",
        message: "เข้าสู่ระบบสมาชิกสำเร็จ",
        member: {
          id: m.id,
          memberCode: m.member_code,
          phone: m.phone,
          gender: m.gender,
          age: m.age_range,
          promotions: m.promotion_consent,
          createdAt: m.created_at,
        },
      });

      response.cookies.set(memberCookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 180 * 86400,
      });
      return response;
    }

    // ------------------------------------------------------------------
    // ENROLL / REGISTER (Phone, Password Hash, Gender, Age Range for marketing)
    // ------------------------------------------------------------------
    const phone = normalizePhone(body?.phone);
    const gender = body?.gender ?? "unspecified";
    const age = body?.age ?? "unspecified";
    const rawPassword = typeof body?.password === "string" ? body.password.trim() : "";

    if (!phone) {
      return NextResponse.json({ error: "กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้อง (เช่น 08X-XXX-XXXX)" }, { status: 400 });
    }
    const passCheck = validateMemberPassword(rawPassword);
    if (!passCheck.valid) {
      return NextResponse.json({ error: passCheck.error }, { status: 400 });
    }
    if (
      !memberGenders.includes(gender) ||
      !memberAges.includes(age) ||
      typeof body.promotions !== "boolean" ||
      body.accept !== true
    ) {
      return NextResponse.json({ error: "กรุณาตรวจสอบข้อมูลและยอมรับเงื่อนไขการสมัครสมาชิก" }, { status: 400 });
    }

    const passwordHash = hashMemberPassword(rawPassword);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();

    const { data: enrollData, error: enrollErr } = await admin.rpc("enroll_member_request", {
      p_phone: phone,
      p_gender: gender,
      p_age: age,
      p_promotions: body.promotions,
      p_hash: tokenHash,
      p_password_hash: passwordHash,
    });

    if (enrollErr || !enrollData || enrollData.length === 0) {
      if (
        enrollErr?.message?.includes("PHONE_ALREADY_EXISTS") ||
        enrollErr?.message?.includes("duplicate key") ||
        enrollErr?.code === "23505"
      ) {
        return NextResponse.json(
          {
            error: "เบอร์โทรศัพท์นี้มีอยู่ในระบบแล้ว ไม่สามารถสมัครซ้ำได้ กรุณาเข้าสู่ระบบผ่านแท็บ 'สมาชิกเดิม'",
            isDuplicate: true,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" }, { status: 503 });
    }

    const m = enrollData[0];
    // Ensure active device in database immediately (no waiting for approval)
    await admin
      .from("member_devices")
      .update({ active: true, reviewed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);

    const response = NextResponse.json({
      state: "member",
      message: "สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ระบบสมาชิก Smart Order",
      member: {
        id: m.id,
        memberCode: m.member_code,
        phone: m.phone,
        gender: m.gender,
        age: m.age_range,
        promotions: m.promotion_consent,
        createdAt: m.created_at,
      },
    });

    response.cookies.set(memberCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 180 * 86400,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  }

  const token = (await cookies()).get(memberCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "ไม่พบเซสชันสมาชิก กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();

    const gender = body?.gender ?? "unspecified";
    const age = body?.age ?? "unspecified";

    if (!memberGenders.includes(gender) || !memberAges.includes(age) || typeof body?.promotions !== "boolean") {
      return NextResponse.json({ error: "ข้อมูลส่วนตัวไม่ถูกต้อง" }, { status: 400 });
    }

    const { data, error } = await admin.rpc("update_member_profile", {
      p_hash: tokenHash,
      p_gender: gender,
      p_age: age,
      p_promotions: body.promotions,
    });

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: "แก้ไขข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
    }

    const m = data[0];
    return NextResponse.json({
      message: "แก้ไขข้อมูลส่วนตัวเรียบร้อยแล้ว",
      member: {
        id: m.id,
        memberCode: m.member_code,
        phone: m.phone,
        gender: m.gender,
        age: m.age_range,
        promotions: m.promotion_consent,
        createdAt: m.created_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
}
