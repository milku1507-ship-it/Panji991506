const { Jimp } = require("jimp");
const path = require("path");

const inputPath = path.join(__dirname, "../attached_assets/Hijau_simpel_modern_jualan_keripik_singkong_camilan_stiker_202_1776626705873.png");
const outputPath = path.join(__dirname, "../public/logo.png");

async function run() {
  const image = await Jimp.read(inputPath);

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    if (r < 30 && g < 30 && b < 30) {
      this.bitmap.data[idx + 3] = 0;
    } else if (r < 60 && g < 60 && b < 60) {
      const brightness = Math.max(r, g, b);
      this.bitmap.data[idx + 3] = Math.round((brightness / 60) * 255);
    }
  });

  await image.write(outputPath);
  console.log("Selesai! Logo transparan disimpan ke:", outputPath);
}

run().catch(console.error);
