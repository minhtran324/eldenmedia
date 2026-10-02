import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const require = createRequire(import.meta.url);
const { PNG } = createRequire(require.resolve('qrcode'))('pngjs');
for (const kind of ['room','device']) {
  const payload=`elden:v1:${kind}:00000000-0000-4000-8000-000000000001`;
  const png=PNG.sync.read(await QRCode.toBuffer(payload,{width:768,margin:4,errorCorrectionLevel:'M'}));
  const result=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
  assert.equal(result?.data,payload);
  console.log('PASS generated PNG decoded by browser QR engine:',kind);
}
