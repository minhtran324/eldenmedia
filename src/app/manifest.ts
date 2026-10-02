import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Elden Media",
    short_name: "Elden",
    description: "Quản lý lịch live, phòng, thiết bị và nhân sự Elden Media",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#f0f7ff",
    theme_color: "#0284c7",
    lang: "vi",
    icons: [
      { src: "/icons/elden-v2/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/elden-v2/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/elden-v2/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
