import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "认证接口已下线，当前版本无需登录。" },
    { status: 410 }
  );
}
