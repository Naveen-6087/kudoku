import { NextRequest, NextResponse } from "next/server";

const CRS_UPSTREAM = "https://crs.aztec.network";
const cache = new Map<string, { data: ArrayBuffer; contentType: string }>();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const crsPath = `/${path.join("/")}`;
  const upstreamUrl = `${CRS_UPSTREAM}${crsPath}`;
  const cached = cache.get(crsPath);

  if (cached) {
    return new NextResponse(cached.data, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Cross-Origin-Resource-Policy": "same-origin"
      }
    });
  }

  const headers: HeadersInit = {};
  const range = request.headers.get("range");
  if (range) {
    headers.Range = range;
  }

  try {
    const response = await fetch(upstreamUrl, { headers });
    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: `CRS upstream returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    if (!range && response.status === 200) {
      cache.set(crsPath, { data, contentType });
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "same-origin"
    };
    const contentRange = response.headers.get("content-range");
    if (contentRange) {
      responseHeaders["Content-Range"] = contentRange;
    }

    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch CRS data" }, { status: 502 });
  }
}
