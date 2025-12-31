const sample = `
<div style="position:relative;width:1280px;height:720px;background:#0f172a;">
  <div style="position:absolute;left:290px;top:270px;width:700px;height:96px;color:#fde68a;font-size:80px;font-family:Garamond, serif;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;">
    Happy New Year
  </div>
  <div style="position:absolute;left:490px;top:380px;width:300px;height:120px;color:#ffffff;font-size:120px;font-family:Arial, sans-serif;font-weight:900;display:flex;align-items:center;justify-content:center;text-align:center;">
    2026
  </div>
</div>
`;

const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
let m;
let i = 0;
while ((m = divRe.exec(sample))) {
  i++;
  console.log('MATCH', i);
  console.log('ATTRS:', m[1]);
  console.log('INNER:', JSON.stringify(m[2].trim()));
}
