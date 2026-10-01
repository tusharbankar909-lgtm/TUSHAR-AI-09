const express=require('express'),session=require('express-session'),multer=require('multer'),Database=require('better-sqlite3'),bcrypt=require('bcryptjs'),fs=require('fs'),path=require('path');
const app=express(),db=new Database('store.db');
app.use(express.json());
app.use(session({secret:process.env.SESSION_SECRET||'CHANGE_THIS_SECRET_BEFORE_DEPLOY',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax'}}));

fs.mkdirSync('uploads',{recursive:true});
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,password TEXT,bio TEXT DEFAULT '',avatar TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS apps(id INTEGER PRIMARY KEY,title TEXT,description TEXT,category TEXT DEFAULT 'Other',filename TEXT,icon TEXT DEFAULT '',screenshots TEXT DEFAULT '',owner INTEGER,status TEXT DEFAULT 'pending',views INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY,app_id INTEGER,user_id INTEGER,rating INTEGER,comment TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(app_id,user_id));
`);

const admins=(process.env.ADMIN_USER||'admin').split(',').map(s=>s.trim().toLowerCase());
const isAdmin=req=>req.session.uid&&admins.includes((db.prepare('SELECT username FROM users WHERE id=?').get(req.session.uid)||{}).username?.toLowerCase());

const storage=multer.diskStorage({
  destination:'uploads/',
  filename:(req,f,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+path.extname(f.originalname).toLowerCase())
});
const upload=multer({storage,limits:{fileSize:3*1024*1024},fileFilter:(req,f,cb)=>cb(null,/\.html?$/i.test(f.originalname))});
const media=multer({
  storage,
  limits:{fileSize:2*1024*1024,files:10},
  fileFilter:(req,f,cb)=>cb(null,/^image\/(png|jpeg|webp|gif)$/.test(f.mimetype))
});

const signed=(req,res,next)=>req.session.uid?next():res.status(401).json({error:'Login required'});
const admin=(req,res,next)=>isAdmin(req)?next():res.status(403).json({error:'Admin access required'});
app.use(express.static('public'));
app.use('/uploads',express.static('uploads',{maxAge:'7d'}));

app.post('/api/signup',async(req,res)=>{
  try{
    let {username,password}=req.body;
    if(!username||!password||password.length<6)return res.status(400).json({error:'Username and password (6+ chars) required'});
    let r=db.prepare('INSERT INTO users(username,password) VALUES(?,?)').run(username.trim(),await bcrypt.hash(password,10));
    req.session.uid=r.lastInsertRowid;res.json({ok:true});
  }catch(e){res.status(400).json({error:'Username already exists'})}
});
app.post('/api/login',async(req,res)=>{
  let u=db.prepare('SELECT * FROM users WHERE username=?').get(req.body.username);
  if(!u||!await bcrypt.compare(req.body.password||'',u.password))return res.status(401).json({error:'Invalid login'});
  req.session.uid=u.id;res.json({ok:true});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>{
  let u=req.session.uid&&db.prepare('SELECT id,username,bio,avatar FROM users WHERE id=?').get(req.session.uid);
  res.json({user:u||null,isAdmin:!!isAdmin(req)});
});

app.get('/api/apps',(req,res)=>{
  let q='%'+String(req.query.q||'').slice(0,80)+'%',cat=String(req.query.category||'');
  let sql=`SELECT a.id,a.title,a.description,a.category,a.icon,a.owner,a.views,a.created,u.username,u.avatar,
  (SELECT ROUND(AVG(rating),1) FROM reviews WHERE app_id=a.id) rating,
  (SELECT COUNT(*) FROM reviews WHERE app_id=a.id) reviewCount
  FROM apps a JOIN users u ON u.id=a.owner
  WHERE a.status='approved' AND (a.title LIKE ? OR a.description LIKE ?)`;
  let args=[q,q];if(cat){sql+=' AND a.category=?';args.push(cat)}
  res.json(db.prepare(sql+' ORDER BY a.id DESC').all(...args));
});
app.get('/api/apps/:id',(req,res)=>{
  let a=db.prepare(`SELECT a.id,a.title,a.description,a.category,a.icon,a.screenshots,a.owner,a.views,a.created,
  u.username,u.bio,u.avatar,(SELECT ROUND(AVG(rating),1) FROM reviews WHERE app_id=a.id) rating,
  (SELECT COUNT(*) FROM reviews WHERE app_id=a.id) reviewCount
  FROM apps a JOIN users u ON u.id=a.owner
  WHERE a.id=? AND (a.status='approved' OR a.owner=?)`).get(req.params.id,req.session.uid||-1);
  if(!a)return res.status(404).json({error:'App not found'});res.json(a);
});

/* Photo/media upload: used for profile photos, app icons and app screenshots. */
app.post('/api/media',signed,media.array('images',10),(req,res)=>{
  if(!req.files?.length)return res.status(400).json({error:'Select at least one image'});
  res.json({images:req.files.map(f=>'/uploads/'+f.filename)});
});

app.post('/api/apps',signed,upload.single('html'),(req,res)=>{
  let {title,description='',category='Other',icon='',screenshots=''}=req.body;
  if(!req.file||!title)return res.status(400).json({error:'Title and HTML file required'});
  let r=db.prepare('INSERT INTO apps(title,description,category,filename,icon,screenshots,owner,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(String(title).slice(0,120),String(description).slice(0,2000),category,req.file.filename,icon,screenshots,req.session.uid,isAdmin(req)?'approved':'pending');
  res.json({ok:true,id:r.lastInsertRowid,status:isAdmin(req)?'approved':'pending'});
});
app.put('/api/apps/:id',signed,upload.single('html'),(req,res)=>{
  let a=db.prepare('SELECT * FROM apps WHERE id=?').get(req.params.id);
  if(!a||a.owner!==req.session.uid&&!isAdmin(req))return res.status(403).json({error:'Only the owner can edit this app'});
  let {title=a.title,description=a.description,category=a.category,icon=a.icon,screenshots=a.screenshots}=req.body;
  let filename=a.filename;
  if(req.file){try{fs.unlinkSync(path.join('uploads',filename))}catch{}filename=req.file.filename}
  db.prepare('UPDATE apps SET title=?,description=?,category=?,icon=?,screenshots=?,filename=?,status=? WHERE id=?')
    .run(title,description,category,icon,screenshots,filename,isAdmin(req)?a.status:'pending',a.id);
  res.json({ok:true});
});
app.delete('/api/apps/:id',signed,(req,res)=>{
  let a=db.prepare('SELECT * FROM apps WHERE id=?').get(req.params.id);
  if(!a||a.owner!==req.session.uid&&!isAdmin(req))return res.status(403).json({error:'Owner/admin only'});
  try{fs.unlinkSync(path.join('uploads',a.filename))}catch{}
  db.prepare('DELETE FROM apps WHERE id=?').run(a.id);db.prepare('DELETE FROM reviews WHERE app_id=?').run(a.id);res.json({ok:true});
});
app.get('/api/my-apps',signed,(req,res)=>res.json(db.prepare('SELECT id,title,description,category,status,views FROM apps WHERE owner=? ORDER BY id DESC').all(req.session.uid)));
app.get('/api/admin/apps',signed,admin,(req,res)=>res.json(db.prepare(`SELECT a.*,u.username FROM apps a JOIN users u ON u.id=a.owner ORDER BY a.id DESC`).all()));
app.patch('/api/admin/apps/:id',signed,admin,(req,res)=>{
  let status=req.body.status;if(!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'Invalid status'});
  db.prepare('UPDATE apps SET status=? WHERE id=?').run(status,req.params.id);res.json({ok:true});
});

app.get('/api/profile/:id',(req,res)=>{
  let u=db.prepare('SELECT id,username,bio,avatar FROM users WHERE id=?').get(req.params.id);
  if(!u)return res.status(404).end();res.json(u);
});
app.patch('/api/profile',signed,(req,res)=>{
  let {bio='',avatar=''}=req.body;
  db.prepare('UPDATE users SET bio=?,avatar=? WHERE id=?').run(String(bio).slice(0,500),String(avatar).slice(0,500),req.session.uid);
  res.json({ok:true});
});
app.post('/api/profile/avatar',signed,media.single('image'),(req,res)=>{
  if(!req.file)return res.status(400).json({error:'Image required'});
  let old=db.prepare('SELECT avatar FROM users WHERE id=?').get(req.session.uid)?.avatar;
  let avatar='/uploads/'+req.file.filename;
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(avatar,req.session.uid);
  if(old?.startsWith('/uploads/')){try{fs.unlinkSync(path.join('uploads',path.basename(old)))}catch{}}
  res.json({avatar});
});

app.get('/api/reviews/:id',(req,res)=>res.json(db.prepare('SELECT r.rating,r.comment,r.created,u.username FROM reviews r JOIN users u ON u.id=r.user_id WHERE app_id=? ORDER BY r.id DESC').all(req.params.id)));
app.post('/api/reviews/:id',signed,(req,res)=>{
  let a=db.prepare("SELECT id FROM apps WHERE id=? AND status='approved'").get(req.params.id);
  let rating=Number(req.body.rating),comment=String(req.body.comment||'').slice(0,1000);
  if(!a||rating<1||rating>5||!Number.isInteger(rating))return res.status(400).json({error:'Choose a rating from 1 to 5'});
  db.prepare('INSERT INTO reviews(app_id,user_id,rating,comment) VALUES(?,?,?,?) ON CONFLICT(app_id,user_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created=CURRENT_TIMESTAMP')
    .run(a.id,req.session.uid,rating,comment);res.json({ok:true});
});

app.get('/run/:id',(req,res)=>{
  let a=db.prepare("SELECT filename FROM apps WHERE id=? AND status='approved'").get(req.params.id);
  if(!a)return res.status(404).send('App not available');
  db.prepare('UPDATE apps SET views=views+1 WHERE id=?').run(req.params.id);
  res.set('Content-Security-Policy',"default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'");
  res.sendFile(path.resolve('uploads',a.filename));
});
app.listen(process.env.PORT||3000,()=>console.log('TUSHAR APP STORE on port '+(process.env.PORT||3000)));
