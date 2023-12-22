import { Account, Aptos, AptosConfig, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

const APT20_CONTRACT_ADDRESS = import.meta.env.VITE_APP_APT20_CONTRACT_ADDRESS;
const CONTRACT_ADDRESS = import.meta.env.VITE_APP_CONTRACT_ADDRESS;

const useContract = () => {
  const aptos = new Aptos(
    new AptosConfig({
      network: import.meta.env.VITE_APP_NETWORK,
    }),
  );

  const getInscriptionConf = async (name: string) => {
    if (!name) return;

    return await aptos.view({
      payload: {
        function: `${APT20_CONTRACT_ADDRESS}::apts::get_inscription_conf`,
        functionArguments: [name],
      },
    });
  };

  const preapreAccountWithPrivateKey = async (privateKey: any) => {
    const prik = new Ed25519PrivateKey(privateKey);
    return Account.fromPrivateKey({
      privateKey: prik,
    });
  };

  const mint = async (privateKey: String, mintArgs: any) => {
    const account: Account = await preapreAccountWithPrivateKey(privateKey);
    // name, txn_count,sub_account_count
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${CONTRACT_ADDRESS}::scripts::mint`,
        typeArguments: [],
        functionArguments: [
          mintArgs.tokenName,
          mintArgs.mintSubAmountPerAccountInOneEpoch,
          mintArgs.mintSubAccountAmount,
        ],
      },
    });

    const [userTransactionResponse] = await aptos.transaction.simulate.simple({
      signerPublicKey: account.publicKey,
      transaction,
    });

    if (!userTransactionResponse.success) {
      throw new Error(userTransactionResponse.vm_status);
    }

    // using signAndSubmit combined
    const committedTransaction = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    await aptos.waitForTransaction({ transactionHash: committedTransaction.hash });

    return {
      address: account.accountAddress.toString(),
      transactionHash: committedTransaction.hash,
    };
  };

  // Create Sub Account with Private Key
  const createSubAccount = async (privateKey: String, amount: number) => {
    const account: Account = await preapreAccountWithPrivateKey(privateKey);

    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: `${CONTRACT_ADDRESS}::scripts::create_account`,
        typeArguments: [],
        functionArguments: [amount],
      },
    });

    // using signAndSubmit combined
    const committedTransaction = await aptos.signAndSubmitTransaction({
      signer: account,
      transaction,
    });

    await aptos.waitForTransaction({ transactionHash: committedTransaction.hash });
  };

  const checkSubAccount = async (privateKey: String) => {
    const account: Account = await preapreAccountWithPrivateKey(privateKey);
    return await aptos.view({
      payload: {
        function: `${CONTRACT_ADDRESS}::scripts::get_account_count`,
        functionArguments: [account.accountAddress.toString()],
      },
    });
  };

  const getSubAccount = async (privateKey: String) => {
    const account: Account = await preapreAccountWithPrivateKey(privateKey);
    return await aptos.view({
      payload: {
        function: `${CONTRACT_ADDRESS}::scripts::get_accounts`,
        functionArguments: [account.accountAddress.toString()],
      },
    });
  };

  const gatherSubAccount = async () => {};

  return {
    getInscriptionConf,
    mint,

    checkSubAccount,
    createSubAccount,
    getSubAccount,

    gatherSubAccount,
  };
};

export default useContract;

