const { Jimp } = require("jimp");
const path = require("path");

const inputPath = path.join(__dirname, "../attached_assets/20260421_101823_1776741709002.jpg");
const outputPath = path.join(__dirname, "../public/logo.png");

async function run() {
  const image = await Jimp.read(inputPath);

  const threshold = 235;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    const isWhite = r > threshold && g > threshold && b > threshold;
    const isNearWhite = r > 210 && g > 210 && b > 210;

    if (isWhite) {
      this.bitmap.data[idx + 3] = 0;
    } else if (isNearWhite) {
      const dist = Math.min(r, g, b);
      const alpha = Math.round(((255 - dist) / (255 - 210)) * 255);
      this.bitmap.data[idx + 3] = Math.min(255, alpha);
    }
  });

  await image.write(outputPath);
  console.log("Selesai! Logo transparan tersimpan:", outputPath);
}

run().catch(console.error);
