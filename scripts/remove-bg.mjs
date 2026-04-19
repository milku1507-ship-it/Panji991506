import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inputPath = path.join(__dirname, "../attached_assets/Hijau_simpel_modern_jualan_keripik_singkong_camilan_stiker_202_1776626705873.png");
const outputPath = path.join(__dirname, "../public/logo.png");

const image = await Jimp.read(inputPath);

image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
  const r = this.bitmap.data[idx + 0];
  const g = this.bitmap.data[idx + 1];
  const b = this.bitmap.data[idx + 2];

  const isBlack = r < 30 && g < 30 && b < 30;
  const isNearBlack = r < 50 && g < 50 && b < 50;

  if (isBlack) {
    this.bitmap.data[idx + 3] = 0;
  } else if (isNearBlack) {
    const brightness = Math.max(r, g, b);
    const alpha = Math.round((brightness / 50) * 255);
    this.bitmap.data[idx + 3] = alpha;
  }
});

await image.writeAsync(outputPath);
console.log("Logo saved with transparent background to", outputPath);
