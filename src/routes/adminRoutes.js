const express=require('express');
const {ObjectId}=require('mongodb');
const {getDB}=require('../config/db');
const requireAuth=require('../middleware/requireAuth');
const router=express.Router();
function admin(req,res,next){const ids=(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);if(!ids.length||!ids.includes(String(req.user?.id||'')))return res.status(403).json({success:false,message:'Admin access not configured or denied.'});next()}
router.use(requireAuth,admin);
router.get('/overview',async(_req,res)=>{try{const db=getDB();const [studios,bookings,users]=await Promise.all([db.collection('studios').countDocuments(),db.collection('bookings').countDocuments(),db.collection('user').countDocuments().catch(()=>null)]);const recent=await db.collection('studios').find({},{projection:{title:1,location:1,status:1,createdAt:1}}).sort({createdAt:-1}).limit(40).toArray();res.json({success:true,data:{studios,bookings,users,recent}})}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to load overview.'})}});
router.patch('/studios/:id/status',async(req,res)=>{try{const id=req.params.id,status=req.body?.status;if(!/^[a-f0-9]{24}$/i.test(id)||!['active','inactive'].includes(status))return res.status(400).json({success:false,message:'Invalid studio or status.'});const db=getDB();const result=await db.collection('studios').updateOne({_id:new ObjectId(id)},{$set:{status,updatedAt:new Date()}});if(!result.matchedCount)return res.status(404).json({success:false,message:'Studio not found.'});res.json({success:true})}catch(e){console.error(e);res.status(500).json({success:false,message:'Could not update studio.'})}});
module.exports=router;
