const path = require('path');
const sharp = require('sharp')
const { createWorker } = require('tesseract.js');

const image = path.resolve(__dirname, ('screenshot_with_pii.png'));
console.log(`Recognizing ${image}`);

(async () => {
  const worker = await createWorker("eng", 1, {
    logger: m => m,
  });
  const { data } = await worker.recognize(image);
  let img = await sharp(image).toBuffer()
  let items = data.lines.map(e=>{
    const text = e.text
    const bbox = e.bbox
    const hasPII = testPII(text)
    return {text,bbox,hasPII}
  }).filter(f=>f.hasPII)
  console.log(items)
  for await (const item of items){
    const { x0, y0, x1, y1 } = item.bbox
    console.log("Compositing item")
    let buffer = await sharp(img).composite([{
      input: {
        create: {
          width: x1 - x0,
          height: y1 - y0,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      },
      top: y0,
      left: x0
    }]).jpeg().toBuffer()
    img = buffer
  }
  console.log("Now writing file")
  await worker.terminate();
  
  await sharp(img).jpeg().toFile("redacted.jpg")
  
})();




function testPII(string) {
  const piiRegex = /(\d{3}-\d{2}-\d{4}|\b\d{9}\b|\d{3}\d{3}\d{4}|(\+\d{1,2}\s?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}\b)/g;
  return piiRegex.test(string)
}