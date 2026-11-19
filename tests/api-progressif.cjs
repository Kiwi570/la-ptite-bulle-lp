'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const crypto=require('crypto');
const ROOT=path.join(__dirname,'..'), api=fs.readFileSync(path.join(ROOT,'api/lead.js'),'utf8');
const lib=require(path.join(ROOT,'api/_lib.js'));
const TOKEN='a'.repeat(64), SECOND='b'.repeat(64);
let passed=0;
function fixture(){
 const store=new Map(),leads=[],hits=[];let fail=false,lose=false;
 async function redis(cfg,cmds){const out=[];for(const a of cmds){hits.push(a);let [cmd,k,...args]=a;
   if(cmd==='GET')out.push(store.get(k)||null);
   else if(cmd==='INCR'){const n=Number(store.get(k)||0)+1;store.set(k,n);out.push(n);}
   else if(cmd==='EXPIRE')out.push(1);
   else if(cmd==='EVAL'){
    if(fail)throw Error('Stockage indisponible fictif');
    const n=Number(args[0]),keys=args.slice(1,1+n),v=args.slice(1+n),cur=store.get(keys[0])||'';
    if(k.includes('LREM')&&!k.includes('LSET')){if(cur===v[0]){const i=leads.indexOf(cur);if(i>=0)leads.splice(i,1);store.delete(keys[0]);}out.push(0);continue;}
    if(cur!==v[0]){out.push(-1);continue;}
    if(cur){const i=leads.indexOf(cur);if(i<0){out.push(-2);continue;}if(cur===v[1]){out.push(0);continue;}leads[i]=v[1];store.set(keys[0],v[1]);out.push(2);}
    else {leads.unshift(v[1]);store.set(keys[0],v[1]);out.push(1);}
    if(lose){lose=false;throw Error('Réponse perdue fictive');}
   }else throw Error('Commande Redis non autorisée dans ce test : '+cmd);
 }return out;}
 const ctx={require:n=>n==='./_lib'?{...lib,redisConfig:()=>({url:'https://fictif.upstash.io',token:'fictif'}),redis}:n==='crypto'?crypto:(()=>{throw Error('Import inattendu')})(),module:{exports:{}},console:{error(){},log(){}},Date,Buffer,URL};
 vm.runInNewContext(api,ctx,{filename:'lead.js'});
 async function post(body,extra={}){
  const r={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(d){this.data=d;return this;}};
  await ctx.module.exports({method:'POST',headers:{host:'wix.partenaire.ptitebulle.fr',origin:'https://wix.partenaire.ptitebulle.fr','x-forwarded-for':'192.0.2.1'},body,...extra},r);return r;
 }
 const site=(ref='1'.repeat(24),source=TOKEN)=>({etape:'site',ref,source_message:source,type:'site',site:'https://example.fr',origine:'hero',page:'https://wix.partenaire.ptitebulle.fr/'});
 return {store,leads,hits,post,site,fail:()=>{fail=true;},lose:()=>{lose=true;}};
}
async function test(n,fn){await fn();passed++;process.stdout.write('OK : '+n+'\n');}
(async()=>{
 await test('URL seule avec sa référence',async()=>{const f=fixture(),r=await f.post(f.site());assert.equal(r.statusCode,200);const l=JSON.parse(f.leads[0]);assert.equal(l.email,'');assert.equal(l.source_message,TOKEN);});
 await test('Email complète la même demande',async()=>{const f=fixture();await f.post(f.site());const a=JSON.parse(f.leads[0]);await f.post({...f.site(),etape:'email',email:'client@example.fr'});const b=JSON.parse(f.leads[0]);assert.equal(f.leads.length,1);assert.equal(b.id,a.id);assert.equal(b.date,a.date);assert.equal(b.email,'client@example.fr');});
 await test('Double clic sans doublon',async()=>{const f=fixture();await Promise.all([f.post(f.site()),f.post(f.site())]);assert.equal(f.leads.length,1);});
 await test('Deux visites identiques restent deux demandes',async()=>{const f=fixture();for(const ref of ['1'.repeat(24),'2'.repeat(24)]){await f.post(f.site(ref));await f.post({...f.site(ref),etape:'email',email:'client@example.fr'});}assert.equal(f.leads.length,2);assert.notEqual(JSON.parse(f.leads[0]).id,JSON.parse(f.leads[1]).id);});
 await test('Étape 1 tardive ne supprime pas l’email',async()=>{const f=fixture();await f.post(f.site());await f.post({...f.site(),etape:'email',email:'client@example.fr'});await f.post(f.site());assert.equal(JSON.parse(f.leads[0]).email,'client@example.fr');});
 await test('Référence changée refusée',async()=>{const f=fixture();await f.post(f.site());const r=await f.post({...f.site(undefined,SECOND),etape:'email',email:'client@example.fr'});assert.equal(r.statusCode,409);assert.equal(JSON.parse(f.leads[0]).source_message,TOKEN);});
 await test('Coordonnées confirmées immuables',async()=>{const f=fixture();await f.post(f.site());await f.post({...f.site(),etape:'email',email:'client@example.fr'});const r=await f.post({...f.site(),etape:'email',email:'autre@example.fr'});assert.equal(r.statusCode,409);});
 await test('Demande directe sans origine toujours acceptée',async()=>{const f=fixture();await f.post({...f.site(undefined,''),etape:'email',email:'client@example.fr'});assert.equal(JSON.parse(f.leads[0]).source_message,'');});
 await test('Identifiant de source malformé non attribué',async()=>{const f=fixture();await f.post(f.site(undefined,'<script>'));assert.equal(JSON.parse(f.leads[0]).source_message,'');});
 await test('Erreur de stockage sans succès affichable',async()=>{const f=fixture();f.fail();const r=await f.post(f.site());assert.equal(r.statusCode,500);assert.equal(r.data.ok,false);assert.equal(f.leads.length,0);});
 await test('Réponse perdue puis reprise sans doublon',async()=>{const f=fixture();f.lose();assert.equal((await f.post(f.site())).statusCode,500);assert.equal((await f.post(f.site())).statusCode,200);assert.equal(f.leads.length,1);});
 await test('Demande supprimée non ressuscitée',async()=>{const f=fixture();await f.post(f.site());f.leads.length=0;const r=await f.post({...f.site(),etape:'email',email:'client@example.fr'});assert.equal(r.statusCode,409);assert.equal(f.leads.length,0);});
 await test('Protection anti-robots conservée',async()=>{const f=fixture();await f.post(f.site());const r=await f.post({...f.site(),lp_hp:'robot'});assert.equal(r.statusCode,200);assert.equal(f.leads.length,0);});
 await test('Origine extérieure refusée',async()=>{const f=fixture();const r=await f.post(f.site(),{headers:{host:'wix.partenaire.ptitebulle.fr',origin:'https://autre.example'}});assert.equal(r.statusCode,403);assert.equal(f.leads.length,0);});
 await test('GET refuse toute création',async()=>{const f=fixture();const r=await f.post({}, {method:'GET'});assert.equal(r.statusCode,405);assert.equal(r.headers['X-LPB-Attribution'],'3');});
 await test('Email invalide refusé',async()=>{const f=fixture();assert.equal((await f.post({...f.site(),etape:'email',email:'incorrect'})).statusCode,400);});
 await test('Limite de nouvelles demandes respectée',async()=>{const f=fixture();for(let i=1;i<=8;i++)assert.equal((await f.post(f.site(i.toString(16).padStart(24,'0')))).statusCode,200);assert.equal((await f.post(f.site('9'.repeat(24)))).statusCode,429);});
 await test('Marqueur LP et deux étapes reliées',async()=>{const js=fs.readFileSync(path.join(ROOT,'main.js'),'utf8');assert(js.includes('lpb-attribution-v3'));assert.equal((js.match(/source_message: sourceMessage/g)||[]).length,2);assert.equal((js.match(/page: pageSansReference\(\)/g)||[]).length,2);});
 await test('Fragment valide, liens directs et conflits',async()=>{const js=fs.readFileSync(path.join(ROOT,'main.js'),'utf8');const a=js.indexOf('  function lireSourceMessage('),b=js.indexOf('  const sourceMessage',a);const fn=vm.runInNewContext(js.slice(a,b)+';lireSourceMessage',{URL,URLSearchParams,Set});assert.equal(fn({href:'https://exemple.fr/#lpb_ref='+TOKEN}),TOKEN);assert.equal(fn({href:'https://exemple.fr/?lpb_ref='+TOKEN}),TOKEN);assert.equal(fn({href:'https://exemple.fr/?lpb_ref='+SECOND+'#lpb_ref='+TOKEN}),'');assert.equal(fn({href:'https://exemple.fr/#faq'}),'');});
 process.stdout.write(passed+' TESTS LP RÉUSSIS — stockage simulé, aucun réseau ni SMTP.\n');
})().catch(e=>{console.error(e);process.exit(1);});
