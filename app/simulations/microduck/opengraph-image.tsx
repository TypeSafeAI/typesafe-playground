import { socialImage } from "../../../lib/social-image";
export const alt = "TypeSafe AI Playground — MicroDuck arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return socialImage("microduck");
}
