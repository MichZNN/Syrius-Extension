// Expression for `dev-harness eval`: clicks each tab-bar link in turn and
// records, per frame for 400 ms, how far the scroller's content exceeds it.
(async () => {
  const scroller = () => document.querySelector('.menu-layout');
  const links = [...document.querySelectorAll('.menu-tabs a, nav a')];
  const out = [];
  for (const link of links) {
    link.click();
    const start = performance.now();
    let worst = 0;
    let settled = 0;
    while (performance.now() - start < 400) {
      await new Promise(requestAnimationFrame);
      const s = scroller();
      if (!s) continue;
      const over = s.scrollHeight - s.clientHeight;
      worst = Math.max(worst, over);
      settled = over;
    }
    out.push(`${link.textContent.trim()}: worst ${worst}, settled ${settled}`);
  }
  return out.join(' | ');
})()
