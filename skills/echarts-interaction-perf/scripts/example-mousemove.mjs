// Example interaction for profile-interaction.mjs: sweep the pointer across the chart in many small steps.
// Copy this file and adapt the target area and step count to your own chart.
export default async (page) => {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no <canvas> found on the page')
  const y = box.y + box.height / 2
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i <= 120; i++) {
      await page.mouse.move(box.x + 60 + (i / 120) * (box.width - 120), y)
    }
  }
  await page.waitForTimeout(300)
}
