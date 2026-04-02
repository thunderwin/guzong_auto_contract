import { NextResponse } from "next/server";

const payload = {
  error: "该接口已下线，请使用 /api/contract/* 接口。",
};

export async function GET() {
  return NextResponse.json(payload, { status: 410 });
}

export async function POST() {
  return NextResponse.json(payload, { status: 410 });
}

export async function PUT() {
  return NextResponse.json(payload, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json(payload, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json(payload, { status: 410 });
}
