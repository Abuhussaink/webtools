export function fitImage(width,height,paper='a4') {
 if(!(width>0&&height>0))throw new Error('Image dimensions must be positive.');
 const size=paper==='a4'?[595.28,841.89]:paper==='letter'?[612,792]:[width,height];
 if(Math.max(...size)>14400)throw new Error('Image-sized PDF pages are limited to 14,400 points. Choose A4 or Letter.');
 const margin=paper==='image'?0:24,scale=Math.min((size[0]-2*margin)/width,(size[1]-2*margin)/height);
 return {size,x:(size[0]-width*scale)/2,y:(size[1]-height*scale)/2,width:width*scale,height:height*scale};
}
// Place pages on one canvas: 'vertical' (stacked), 'horizontal' (side by side) or 'grid' (2 columns).
// sizes: [{width,height}] in pixels. Pages are centred in their cell. Returns positions and the total size.
export function combineLayout(sizes,arrangement,gap=0){
 if(!sizes.length)throw new Error('Choose at least one page.');
 const n=sizes.length,cols=arrangement==='vertical'?1:arrangement==='horizontal'?n:Math.min(2,n),rows=Math.ceil(n/cols);
 const colW=Array(cols).fill(0),rowH=Array(rows).fill(0);
 sizes.forEach((s,i)=>{const c=i%cols,r=Math.floor(i/cols);colW[c]=Math.max(colW[c],s.width);rowH[r]=Math.max(rowH[r],s.height);});
 const colX=colW.map((_,c)=>colW.slice(0,c).reduce((a,b)=>a+b,0)+gap*c),rowY=rowH.map((_,r)=>rowH.slice(0,r).reduce((a,b)=>a+b,0)+gap*r);
 const cells=sizes.map((s,i)=>{const c=i%cols,r=Math.floor(i/cols);return {x:colX[c],y:rowY[r],width:colW[c],height:rowH[r],pageX:colX[c]+(colW[c]-s.width)/2,pageY:rowY[r]+(rowH[r]-s.height)/2};});
 return {width:colX[cols-1]+colW[cols-1],height:rowY[rows-1]+rowH[rows-1],cells};
}
// Scale factor (≤ 1) that keeps a canvas inside limits all common browsers, including iPhone Safari, can export.
export function fitPixels(width,height,maxPixels=16000000,maxSide=16384){
 return Math.min(1,Math.sqrt(maxPixels/(width*height)),maxSide/width,maxSide/height);
}
// Split page indices into groups of `size` ('all' = one group).
export function chunkPages(indices,size){
 const n=size==='all'?indices.length:Number(size);if(!Number.isInteger(n)||n<1)throw new Error('Choose how many pages go in each image.');
 const out=[];for(let i=0;i<indices.length;i+=n)out.push(indices.slice(i,i+n));return out;
}
export function stampPage(lib,page,font,vp,options) {
 const {size,color}=options;
 if(options.mode==='numbers'){
  const text=String(options.number),width=font.widthOfTextAtSize(text,size);
  if(vp.width<width+8||vp.height<2*options.margin+2*size)throw new Error('A page is too small for the selected font size or margin. Reduce them.');
  const [x,y]=vp.convertToPdfPoint((vp.width-width)/2,options.position==='top'?options.margin+size:vp.height-options.margin);
  page.drawText(text,{font,size,x,y,color,rotate:lib.degrees(vp.rotation)});
 }else{
  const textWidth=font.widthOfTextAtSize(options.text,size);
  const actualSize=Math.min(size,Math.min(vp.width,vp.height)*.8/Math.max(textWidth/size,1));
  const width=font.widthOfTextAtSize(options.text,actualSize),[cx,cy]=vp.convertToPdfPoint(vp.width/2,vp.height/2),rotation=vp.rotation+options.angle,rad=rotation*Math.PI/180;
  page.drawText(options.text,{font,size:actualSize,x:cx-width/2*Math.cos(rad)+actualSize*.3*Math.sin(rad),y:cy-width/2*Math.sin(rad)-actualSize*.3*Math.cos(rad),color,opacity:options.opacity,rotate:lib.degrees(rotation)});
 }
}
