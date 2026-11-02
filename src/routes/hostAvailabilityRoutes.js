const express = require("express");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();
const validId = id => typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
const validDate = date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + "T00:00:00Z")) && new Date(date + "T00:00:00Z").toISOString().slice(0,10) === date;
const mins = t => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? (+t.slice(0,2))*60+(+t.slice(3)) : null;
const origin = (req,res,next) => req.headers.origin === (process.env.CLIENT_URL || "http://localhost:3000") ? next() : res.status(403).json({success:false,message:"Invalid request origin."});
async function own(db,id,userId){return db.collection('studios').findOne({_id:new ObjectId(id),ownerId:userId});}
router.get('/blocks',requireAuth,async(req,res)=>{
 try {const db=getDB();const owned=await db.collection('studios').find({ownerId:req.user.id},{projection:{_id:1,title:1}}).toArray();const ids=owned.map(s=>s._id.toString());const data=await db.collection('studioBlocks').find({studioId:{$in:ids}}).sort({date:1,startMinutes:1}).limit(3000).toArray();res.json({success:true,studios:owned.map(s=>({_id:s._id,title:s.title})),data});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to load blocks.'});}
});
router.post('/blocks',requireAuth,origin,async(req,res)=>{
 try {const {studioId,date,startTime,endTime,reason}=req.body||{};if(!validId(studioId)||!validDate(date)||date<new Date().toISOString().slice(0,10)) return res.status(400).json({success:false,message:'Invalid studio or date.'});
 const start=mins(startTime),end=mins(endTime);if(start===null||end===null||start<480||end>1200||end<=start||start%30||end%30)return res.status(400).json({success:false,message:'Use 30-minute intervals between 08:00 and 20:00.'});
 const db=getDB();if(!await own(db,studioId,req.user.id))return res.status(404).json({success:false,message:'Studio not found.'});
 const reservations=await db.collection('bookings').findOne({studioId:{$in:[new ObjectId(studioId),studioId]},date,status:{$in:['pending','confirmed']},startMinutes:{$lt:end},endMinutes:{$gt:start}});
 if(reservations)return res.status(409).json({success:false,message:'Existing reservation overlaps the requested block.'});
 const overlap=await db.collection('studioBlocks').findOne({studioId,date,startMinutes:{$lt:end},endMinutes:{$gt:start}});
 if(overlap)return res.status(409).json({success:false,message:'This time is already blocked.'});
 const item={studioId,date,startTime,endTime,startMinutes:start,endMinutes:end,reason:typeof reason==='string'?reason.trim().slice(0,120):'',ownerId:req.user.id,createdAt:new Date()};const result=await db.collection('studioBlocks').insertOne(item);res.status(201).json({success:true,data:{...item,_id:result.insertedId}});
 }catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to create block.'});}
});
router.delete('/blocks/:id',requireAuth,origin,async(req,res)=>{
 try {if(!validId(req.params.id))return res.status(400).json({success:false,message:'Invalid block ID.'});const db=getDB();const result=await db.collection('studioBlocks').deleteOne({_id:new ObjectId(req.params.id),ownerId:req.user.id});if(!result.deletedCount)return res.status(404).json({success:false,message:'Block not found.'});res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to delete block.'});}
});
module.exports=router;
