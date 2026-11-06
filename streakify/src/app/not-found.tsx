/**
 * Shown when an address doesn't match any café (for example a preview URL).
 * Offers the path-style links, which work on any address.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center text-neutral-100" style={{ background: "#0b0b0c", minHeight: "100vh" }}>
      <h1 className="text-2xl font-bold">No café at this address</h1>
      <p className="mt-2 text-white/60">Try one of these links instead:</p>
      <ul className="mt-6 space-y-3">
        <li><a className="block rounded-xl bg-white/10 p-4 hover:bg-white/20" href="/c/demo/counter">Demo café: counter tablet</a></li>
        <li><a className="block rounded-xl bg-white/10 p-4 hover:bg-white/20" href="/c/sanaacafe/counter">Sana&apos;a Cafe: counter tablet (PIN 2580)</a></li>
        <li><a className="block rounded-xl bg-white/10 p-4 hover:bg-white/20" href="/c/sanaacafe">Sana&apos;a Cafe: rewards page</a></li>
      </ul>
    </main>
  );
}
