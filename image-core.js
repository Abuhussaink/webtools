export function cropBounds(x,y,width,height,sourceWidth,sourceHeight){
 const values=[x,y,width,height,sourceWidth,sourceHeight];
 if(!values.every(Number.isInteger)||x<0||y<0||width<1||height<1||x+width>sourceWidth||y+height>sourceHeight)throw new Error('Choose whole-pixel crop coordinates inside the image.');
 return {x,y,width,height};
}
export function resizeDimensions(width,height,maxPixels=20000000){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16000||height>16000||width*height>maxPixels)throw new Error('Use dimensions from 1–16,000 pixels, with at most 20 million pixels total.');
 return {width,height};
}
export function rotationDimensions(width,height,angle){if(![0,90,180,270].includes(angle))throw new Error('Choose a quarter-turn rotation.');return angle%180?{width:height,height:width}:{width,height};}
export function watermarkPosition(pageWidth,pageHeight,width,height,position,margin){
 const horizontal=position.split('-')[1]||'center',vertical=position.split('-')[0];
 const x=horizontal==='left'?margin:horizontal==='right'?pageWidth-width-margin:(pageWidth-width)/2;
 const y=vertical==='top'?margin:vertical==='bottom'?pageHeight-height-margin:(pageHeight-height)/2;
 return {x:Math.max(0,Math.min(x,pageWidth-width)),y:Math.max(0,Math.min(y,pageHeight-height))};
}
