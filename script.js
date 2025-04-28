// Mapping of source chain to domain ID
const sourceDomainIDs = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  unichain: 10,
  linea: 11,
};

// Contract mapping
const contractsV2 = {
  ethereum: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  avalanche: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  arbitrum: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  base: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  linea: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  polygon: "0xF3be9355363857F3e001be68856A2f96b4C39Ba9",
};

const contractsV1 = {
  ethereum: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
  avalanche: "0x8186359aF5F57FbB40c6b14A588d2A59C0C29880",
  optimism: "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
  arbitrum: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
  base: "0xAD09780d193884d503182aD4588450C416D6F9D4",
  polygon: "0xF3be9355363857F3e001be68856A2f96b4C39Ba9",
  unichain: "0x353bE9E2E38AB1D19104534e4edC21c643Df86f4",
};

// Global signer
let signer = null;

// Connect EVM wallet
async function connectWallet() {
  const walletAddress = document.getElementById('walletAddress');
  const status = document.getElementById('status');

  if (!window.ethereum) {
    alert('MetaMask or compatible wallet not found.');
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    walletAddress.innerText = `Connected: ${accounts[0]}`;
    status.innerText = '';
  } catch (error) {
    console.error(error);
    status.innerText = `Error: ${error.message || error}`;
  }
}

// Fetch CCTP message + detect version
async function fetchCCTPMessageSmart(txHash, sourceChain) {
  const domainID = sourceDomainIDs[sourceChain];
  if (domainID === undefined) throw new Error('Unknown source chain.');

  // Try V2 first
  try {
    const response = await fetch(`https://iris-api.circle.com/v2/messages/${domainID}?transactionHash=${txHash}`);
    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      console.log('Detected V2 message');
      return { message: data.messages[0].message, attestation: data.messages[0].attestation, version: 2 };
    }
  } catch {
    console.log('V2 fetch failed, trying V1...');
  }

  // Try V1
  try {
    const response = await fetch(`https://iris-api.circle.com/v1/messages/${domainID}?transactionHash=${txHash}`);
    const data = await response.json();
    if (data.messages && data.messages.length > 0) {
      console.log('Detected V1 message');
      return { message: data.messages[0].message, attestation: data.messages[0].attestation, version: 1 };
    }
  } catch {
    console.log('V1 fetch failed.');
  }

  throw new Error('Transaction not found in CCTP V1 or V2.');
}

// Relay to EVM chains
async function relayToEVM(message, attestation, contractAddress) {
  const status = document.getElementById('status');

  if (!signer) {
    alert('Please connect your wallet first.');
    return;
  }

  try {
    const abi = [
      "function receiveMessage(bytes calldata _message, bytes calldata _attestation) external"
    ];
    const contract = new ethers.Contract(contractAddress, abi, signer);

    status.innerText = 'Relaying message on EVM... Confirm transaction in your wallet.';

    const tx = await contract.receiveMessage(message, attestation);
    console.log('Transaction sent:', tx.hash);

    status.innerText = 'Transaction sent. Waiting for confirmation...';
    await tx.wait();

    status.innerText = 'Transaction confirmed! 🎉';
  } catch (error) {
    console.error(error);
    status.innerText = `Error: ${error.message || error}`;
  }
}

// Main relay function
async function relay() {
  const txHash = document.getElementById('txHash').value.trim();
  const sourceChain = document.getElementById('sourceChain').value;
  const destinationChain = document.getElementById('destinationChain').value;
  const status = document.getElementById('status');

  if (!txHash || !sourceChain || !destinationChain) {
    alert('Please fill all fields');
    return;
  }

  try {
    status.innerText = 'Fetching message...';
    const { message, attestation, version } = await fetchCCTPMessageSmart(txHash, sourceChain);

    let contractAddress;
    if (version === 2) {
      contractAddress = contractsV2[destinationChain];
    } else {
      contractAddress = contractsV1[destinationChain];
    }

    if (!contractAddress) {
      throw new Error('No contract address found for this destination.');
    }

    await relayToEVM(message, attestation, contractAddress);
  } catch (error) {
    console.error(error);
    status.innerText = `Error: ${error.message || error}`;
  }
}
