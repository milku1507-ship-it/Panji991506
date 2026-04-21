const { Jimp } = require("jimp");
const path = require("path");

const inputPath = path.join(__dirname, "../public/logo.png");

async function generateIcon(size, outputName) {
  const image = await Jimp.read(inputPath);

  const icon = new Jimp({ width: size, height: size, color: 0xFFFFFFFF });

  const resized = image.clone().resize({ w: Math.round(size * 0.85), h: Math.round(size * 0.85) });
  const offset = Math.round(size * 0.075);
  icon.composite(resized, offset, offset);

  await icon.write(path.join(__dirname, "../public", outputName));
  console.log(`Generated ${outputName} (${size}x${size})`);
}

async function run() {
  await generateIcon(192, "icon-192.png");
  await generateIcon(512, "icon-512.png");
  console.log("Semua icon PWA berhasil dibuat!");
}

run().catch(console.error);
