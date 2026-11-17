const readline=require('node:readline/promises');const {stdin,stdout}=require('node:process');const {hiddenPassword}=require('./privatePrompt');const {recoverPassword}=require('../services/recoverPasswordService');
async function main(){
 if(!stdin.isTTY || !stdout.isTTY)throw new Error('Run recovery in a private interactive server terminal');
 if(process.argv.length>2)throw new Error('Do not pass credentials as command-line arguments');
 const db=require('../config/database');try{
  const prompt=readline.createInterface({input:stdin,output:stdout});let email,confirm;
  try{email=(await prompt.question('Account email to recover: ')).trim().toLowerCase();confirm=await prompt.question('Type RESET to replace this account password and sign it out on all devices: ');}finally{prompt.close();}
  if(confirm!=='RESET')throw new Error('Recovery cancelled');
  const password=await hiddenPassword('New password (12-128 characters, hidden): ');
  if(password!==await hiddenPassword('Confirm new password (hidden): '))throw new Error('Passwords do not match');
  await recoverPassword(db,email,password);console.log('Password replaced and account sessions revoked. Role and activation status were not changed.');
 }finally{await db.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.code?'Recovery failed; inspect database availability':error.message);process.exitCode=1;});
module.exports={main};
