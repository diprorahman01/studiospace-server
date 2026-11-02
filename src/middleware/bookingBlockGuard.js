const { ObjectId }=require('mongodb');
const {getDB}=require('../config/db');
const validId=id=>typeof id==='string'&&/^[a-fA-F0-9]{24}$/.test(id);
const mins=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
// Check blocks before create/reschedule. Also overlays blocked slots on availability responses.
module.exports=async function bookingBlockGuard(req,res,next){
 try{
  const availability=req.method==='GET'&&/^\/availability\/[a-f0-9]{24}$/i.test(req.path);
  const creating=req.method==='POST'&&req.path==='/';
  const rescheduling=req.method==='PATCH'&&/^\/[a-f0-9]{24}\/reschedule$/i.test(req.path);
  if(!availability&&!creating&&!rescheduling)return next();
  const db=getDB();let studioId=availability?req.params.studioId||req.path.split('/')[2]:req.body?.studioId;
  if(rescheduling){const existing=await db.collection('bookings').findOne({_id:new ObjectId(req.path.split('/')[1])},{projection:{studioId:1}});studioId=existing?.studioId?.toString();}
  const date=availability?req.query.date:req.body?.date;
  if(!validId(String(studioId||''))||typeof date!=='string')return next();
  const blocks=await db.collection('studioBlocks').find({studioId:String(studioId),date}).toArray();
  if(availability){const original=res.json.bind(res);res.json=function(payload){if(payload?.success&&Array.isArray(payload?.data?.slots)){payload.data.slots=payload.data.slots.map(slot=>{const start=mins(slot.startTime),end=mins(slot.endTime);const blocked=blocks.some(b=>start!==null&&end!==null&&b.startMinutes<end&&b.endMinutes>start);return blocked?{...slot,available:false,reason:'blocked'}:slot;});}return original(payload);};return next();}
  const start=mins(req.body?.startTime),end=mins(req.body?.endTime);
  if(start!==null&&end!==null&&blocks.some(b=>b.startMinutes<end&&b.endMinutes>start))return res.status(409).json({success:false,message:'The host has blocked this time. Select another slot.'});
  next();
 }catch(e){console.error('Block guard error',e);res.status(503).json({success:false,message:'Unable to verify studio availability.'});}
};
