// owner.js — MTEC Owner Panel | ethers v5
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ZERO = "0x0000000000000000000000000000000000000000";

  let provider, signer, wallet, chainId;
  let contract;

  function shortAddr(a) {
    if (!a) return "-";
    return a.slice(0, 6) + "..." + a.slice(-4);
  }

  function setMsg(text, isError = false) {
    const el = $("msg");
    if (!el) return;
    el.textContent = text || "";
    el.style.opacity = text ? "1" : "0";
    el.style.borderColor = isError ? "#ff5a5a" : "rgba(10, 60, 120, .12)";
  }

  function setBtnLoading(btn, loading, label = "Processing...") {
    if (!btn) return;
    if (loading) {
      btn.dataset._old = btn.textContent;
      btn.textContent = label;
      btn.disabled = true;
      btn.style.opacity = "0.7";
    } else {
      btn.textContent = btn.dataset._old || btn.textContent;
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  }

  async function waitTx(tx, label) {
    setMsg(`${label}: ส่งแล้ว รอ Confirm...`);
    const r = await tx.wait();
    setMsg(`${label}: สำเร็จ ✅ (block ${r.blockNumber})`);
    return r;
  }

  function ensureConfig() {
    if (!window.NETWORK || !window.ADDR || !window.CONTRACT_ABI) {
      throw new Error("config.js ไม่ครบ (NETWORK/ADDR/CONTRACT_ABI)");
    }
  }

  function toDays(secBN) {
    const sec = Number(secBN.toString());
    const days = sec / 86400;
    return days;
  }

  function bpsToPct(bpsBN) {
    const bps = Number(bpsBN.toString());
    return (bps / 100).toFixed(2);
  }

  function pctToBps(pct) {
    // pct เช่น 30 => bps 3000
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0) throw new Error("ค่า APY% ไม่ถูกต้อง");
    return Math.round(n * 100);
  }

  function daysToSec(days) {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 0) throw new Error("ค่า Lock days ไม่ถูกต้อง");
    return Math.round(n * 86400);
  }

  function parseAmount(val, decimals) {
    const s = String(val ?? "").trim();
    if (!s) throw new Error("กรุณากรอกจำนวน");
    return ethers.utils.parseUnits(s, decimals);
  }

  function toAddrOrDefault(val) {
    const s = String(val ?? "").trim();
    if (!s) return wallet; // default to connected owner wallet
    if (!ethers.utils.isAddress(s)) throw new Error("Address ปลายทางไม่ถูกต้อง");
    return ethers.utils.getAddress(s);
  }

  async function connect() {
    ensureConfig();

    if (!window.ethereum) {
      setMsg("ไม่พบ Wallet (MetaMask/Bitget)", true);
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    const accs = await provider.send("eth_requestAccounts", []);
    wallet = ethers.utils.getAddress(accs[0]);
    signer = provider.getSigner();

    const net = await provider.getNetwork();
    chainId = Number(net.chainId);

    $("chainText").textContent = `chainId: ${chainId}`;
    $("walletText").textContent = `wallet: ${shortAddr(wallet)}`;
    $("contractText").textContent = window.ADDR.CONTRACT;

    if (chainId !== window.NETWORK.chainId) {
      setMsg("กำลังสลับไป BSC (0x38) ...");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: window.NETWORK.chainIdHex }]
        });
      } catch (e) {
        if (e && (e.code === 4902 || String(e.message || "").includes("Unrecognized chain"))) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: window.NETWORK.chainIdHex,
              chainName: window.NETWORK.chainName,
              rpcUrls: window.NETWORK.rpcUrls,
              nativeCurrency: window.NETWORK.nativeCurrency,
              blockExplorerUrls: window.NETWORK.blockExplorerUrls
            }]
          });
        } else {
          setMsg("สลับเครือข่ายไม่สำเร็จ กรุณาเปลี่ยนเป็น BSC ด้วยตนเอง", true);
          return;
        }
      }
      const net2 = await provider.getNetwork();
      chainId = Number(net2.chainId);
      $("chainText").textContent = `chainId: ${chainId}`;
      if (chainId !== window.NETWORK.chainId) {
        setMsg("กรุณาอยู่บน BSC ก่อนใช้งาน Owner Panel", true);
        return;
      }
    }

    contract = new ethers.Contract(window.ADDR.CONTRACT, window.CONTRACT_ABI, signer);

    await loadStatus();
    setMsg("เชื่อมต่อสำเร็จ ✅");
  }

  async function loadStatus() {
    if (!contract) return;

    const owner = await contract.owner();
    $("ownerText").textContent = `owner: ${shortAddr(owner)}`;

    const isOwner = owner.toLowerCase() === wallet.toLowerCase();
    $("isOwnerText").textContent = `status: ${isOwner ? "✅ OWNER" : "❌ NOT OWNER"}`;

    // Read params
    const apyBP = await contract.apyBasisPoints();
    const lockSec = await contract.lockDuration();
    const enabled = await contract.enabled();
    const r1 = await contract.ref1Bps();
    const r2 = await contract.ref2Bps();
    const r3 = await contract.ref3Bps();

    $("apyText").textContent = `APY: ${bpsToPct(apyBP)}%`;
    $("lockText").textContent = `Lock: ${toDays(lockSec).toFixed(0)} days`;
    $("enabledText").textContent = `Enabled: ${enabled ? "true" : "false"}`;
    $("refRateText").textContent = `Ref: ${r1}/${r2}/${r3} bps`;

    // Fill inputs (nice default)
    $("inApyPct").value = bpsToPct(apyBP);
    $("inLockDays").value = String(Math.round(toDays(lockSec)));
    $("inEnabled").value = enabled ? "true" : "false";
    $("inRef1").value = r1.toString();
    $("inRef2").value = r2.toString();
    $("inRef3").value = r3.toString();

    // Disable all action buttons if not owner
    const actions = [
      "btnSetParams","btnSetRefRates","btnWithdrawUSDT","btnWithdrawMTEC","btnSetPackage","btnClaimAll"
    ];
    actions.forEach((id) => {
      const b = $(id);
      if (b) b.disabled = !isOwner;
    });

    if (!isOwner) setMsg("คำเตือน: กระเป๋านี้ไม่ใช่ Owner จึงทำรายการไม่ได้", true);
  }

  async function setParams() {
    const btn = $("btnSetParams");
    setBtnLoading(btn, true, "Setting...");
    try {
      const apyBps = pctToBps($("inApyPct").value);
      const lockSec = daysToSec($("inLockDays").value);
      const enabled = $("inEnabled").value === "true";

      const tx = await contract.setParams(apyBps, lockSec, enabled);
      await waitTx(tx, "Set Params");
      await loadStatus();
    } catch (e) {
      console.error(e);
      setMsg(e?.data?.message || e?.message || "Set Params ไม่สำเร็จ", true);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function setRefRates() {
    const btn = $("btnSetRefRates");
    setBtnLoading(btn, true, "Setting...");
    try {
      const r1 = Number($("inRef1").value);
      const r2 = Number($("inRef2").value);
      const r3 = Number($("inRef3").value);

      if (![r1,r2,r3].every((x) => Number.isFinite(x) && x >= 0)) {
        throw new Error("bps ต้องเป็นตัวเลข >= 0");
      }
      // กันพลาด: รวมไม่ควรเกิน 10000 bps = 100%
      if (r1 + r2 + r3 > 10000) {
        throw new Error("รวม bps เกิน 100% (10000 bps) — ตรวจสอบอีกครั้ง");
      }

      const tx = await contract.setReferralRates(r1, r2, r3);
      await waitTx(tx, "Set Referral Rates");
      await loadStatus();
    } catch (e) {
      console.error(e);
      setMsg(e?.data?.message || e?.message || "Set Referral Rates ไม่สำเร็จ", true);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function withdrawUSDT() {
    const btn = $("btnWithdrawUSDT");
    setBtnLoading(btn, true, "Withdrawing...");
    try {
      const amount = parseAmount($("inWdUsdt").value, window.DECIMALS.USDT);
      const to = toAddrOrDefault($("inToUsdt").value);

      const tx = await contract.withdrawUSDT(amount, to);
      await waitTx(tx, "Withdraw USDT");
    } catch (e) {
      console.error(e);
      setMsg(e?.data?.message || e?.message || "Withdraw USDT ไม่สำเร็จ", true);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function withdrawMTEC() {
    const btn = $("btnWithdrawMTEC");
    setBtnLoading(btn, true, "Withdrawing...");
    try {
      const amount = parseAmount($("inWdMtec").value, window.DECIMALS.MTEC);
      const to = toAddrOrDefault($("inToMtec").value);

      const tx = await contract.withdrawMTEC(amount, to);
      await waitTx(tx, "Withdraw MTEC");
    } catch (e) {
      console.error(e);
      setMsg(e?.data?.message || e?.message || "Withdraw MTEC ไม่สำเร็จ", true);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function setPackage() {
    const btn = $("btnSetPackage");
    setBtnLoading(btn, true, "Setting...");
    try {
      const id = Number($("inPkgId").value);
      if (!Number.isFinite(id) || id < 0) throw new Error("Package ID ไม่ถูกต้อง");

      const usdtIn = parseAmount($("inPkgUsdt").value, window.DECIMALS.USDT);
      const mtecOut = parseAmount($("inPkgMtec").value, window.DECIMALS.MTEC);
      const active = $("inPkgActive").value === "true";

      const tx = await contract.setPackage(id, usdtIn, mtecOut, active);
      await waitTx(tx, "Set Package");
      setMsg("Set Package สำเร็จ ✅ (แนะนำ Reload สถานะ/หน้า user เพื่อตรวจสอบ)");
    } catch (e) {
      console.error(e);
      setMsg(e?.data?.message || e?.message || "Set Package ไม่สำเร็จ", true);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  function bindUI() {
    $("contractText").textContent = window.ADDR?.CONTRACT || "-";

    $("btnConnect")?.addEventListener("click", () => {
      connect().catch((e) => {
        console.error(e);
        setMsg(e?.message || "Connect ไม่สำเร็จ", true);
      });
    });

    $("btnReload")?.addEventListener("click", () => {
      loadStatus().catch((e) => {
        console.error(e);
        setMsg(e?.message || "Reload ไม่สำเร็จ", true);
      });
    });

    $("btnOpenBscscan")?.addEventListener("click", () => {
      const url = `${window.NETWORK.blockExplorerUrls[0]}/address/${window.ADDR.CONTRACT}`;
      window.open(url, "_blank");
    });

    $("btnSetParams")?.addEventListener("click", () => setParams());
    $("btnSetRefRates")?.addEventListener("click", () => setRefRates());
    $("btnWithdrawUSDT")?.addEventListener("click", () => withdrawUSDT());
    $("btnWithdrawMTEC")?.addEventListener("click", () => withdrawMTEC());
    $("btnSetPackage")?.addEventListener("click", () => setPackage());

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
  }

  document.addEventListener("DOMContentLoaded", bindUI);
})();
