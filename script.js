
document.querySelector('.mobile')?.addEventListener('click',()=> {
  const n=document.querySelector('.navlinks');
  n.style.display = n.style.display === 'flex' ? '' : 'flex';
  n.style.position='absolute'; n.style.top='76px'; n.style.left='0'; n.style.right='0';
  n.style.padding='20px'; n.style.background='#07090a'; n.style.flexDirection='column';
});
