import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Samnanger Kamprom",
    short_name: "Kamprommet",
    description: "Lukket kamp- og videoportal for Samnanger",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07130e",
    theme_color: "#07130e",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
