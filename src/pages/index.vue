<template>
  <Form layout="vertical">
    <FormItem label="主网钱包私钥">
      <Input v-model:value="privateKeyString" />
    </FormItem>
    <FormItem label="初始化子账户">
      <div class="flex-col gap-2">
        <div class="flex gap-2 max-w-100">
          <InputNumber
            v-model:value="initializeAmountOfSubAccount"
            class="w-50"
            :max="150"
            :min="1"
            :controls="false"
            :precision="0"
            placeholder="最小1个, 最大150个"
          />
          <Button @click="createSubAccountHandler" :loading="creating">创建子账户</Button>
        </div>
        <div class="flex gap-2 items-center">
          <span>当前子账户数: {{ currentSubAccountAmount }}</span>
          <Button @click="checkSubAccountHandler">查询子账户</Button>
        </div>
      </div>
    </FormItem>

    <div class="flex-col gap-1" v-if="subAccountsList.length > 0">
      <span>子账户列表:</span>
      <div
        class="flex-col gap-1 p-4 rounded-2 border-1 bordedr-solid border-accent bg-secondary/10 max-h-100 overflow-y-auto mb-3"
      >
        <span v-for="(account, index) in subAccountsList" :key="index">
          <a
            class="underline"
            target="_blank"
            :href="`https://explorer.aptoslabs.com/account/${account}?network=${network}`"
          >
            {{ account }}
          </a>
        </span>
      </div>
    </div>

    <FormItem label="归集">
      <Button @click="message.info('开发中, Coming Soon')">归集铭文到主帐号</Button>
    </FormItem>

    <!-- <span>Gas * account, 1 apt 做底</span> -->

    <FormItem label="Token Name">
      <Input v-model:value="mintArgs.tokenName" :maxlength="30" />
    </FormItem>

    <FormItem label="同时mint的子账户数">
      <Input
        v-model:value="mintArgs.mintSubAccountAmount"
        :min="1"
        :max="currentSubAccountAmount"
      />
    </FormItem>
    <FormItem label="同时mint的每个子账户, 在每个Epoch执行的Mint次数">
      <Input v-model:value="mintArgs.mintSubAmountPerAccountInOneEpoch" :min="1" />
    </FormItem>

    <FormItem>
      <Button @click="startMintHandler" :disabled="mintSwitch">🚀启动 Mint</Button>
    </FormItem>
    <FormItem>
      <Button @click="stopMintHandler">停止 Mint</Button>
    </FormItem>
    <FormItem>
      <Textarea :value="logs.join('')" :auto-size="{ minRows: 10, maxRows: 20 }"></Textarea>
    </FormItem>
  </Form>
</template>

<script lang="ts" setup>
  import useContract from '@/hooks/useContract';
  import { sleep } from '@/utils';
  import { Button, Form, FormItem, Input, InputNumber, Textarea, message } from 'ant-design-vue';
  import BigNumber from 'bignumber.js';
  import dayjs from 'dayjs';
  const logs = ref<string[]>([]);
  const { createSubAccount, checkSubAccount, getSubAccount, mint, getInscriptionConf } =
    useContract();

  const privateKeyString = ref('');
  const currentSubAccountAmount = ref(0);
  const initializeAmountOfSubAccount = ref(0);
  const network = import.meta.env.VITE_APP_NETWORK;

  const mintArgs = ref<any>({
    tokenName: '',
    mintSubAmountPerAccountInOneEpoch: 0,
    mintSubAccountAmount: 0,
  });

  const successLog = (transactionHash: string, address: string) =>
    `✅ ${address} 创建交易成功, \t 交易hash: ${transactionHash}`;

  // 1. get epoch
  // 2. mint in current epoch if token isn't ended (currentEpoch < totalEpoch-1 || (currentEpoch == totalEpoch - 1 && epoch still run))
  // 3. if currentTime > endtime, goto 1

  const epochGapSec = 2;
  const runMint = async () => {
    const tokenConf: any = await getInscriptionConf(mintArgs.value.tokenName);
    let newTokenConf: any = null;
    console.log(
      tokenConf[0].state.currentEpoch,
      tokenConf[0].epochCount,
      new BigNumber(tokenConf[0].state.currentEpoch).plus(1).isLessThan(tokenConf[0].epochCount),
    );
    if (
      new BigNumber(tokenConf[0].state.currentEpoch).plus(1).isLessThan(tokenConf[0].epochCount)
    ) {
      try {
        await mintHandler();

        newTokenConf = await getInscriptionConf(mintArgs.value.tokenName);
        addLogHanlder(
          '当前Epoch: ' +
            Number(newTokenConf[0].state.currentEpoch) +
            ', 总共Epoch个数: ' +
            newTokenConf[0].epochCount,
        );
      } catch (e: any) {
        addLogHanlder(e.message);
      }
    } else {
      // current epoch 0 + 1,  epoch count 1
      // last epoch
      if (
        new BigNumber(tokenConf[0].state.epochStartTime)
          .plus(tokenConf[0].epochDuration)
          .isGreaterThan(Date.now() / 1e3)
      ) {
        await mintHandler();
        addLogHanlder(
          '当前Epoch: ' +
            tokenConf[0].state.currentEpoch +
            ', 总共Epoch: ' +
            tokenConf[0].epochCount,
        );
      }

      addLogHanlder('铭文已结束');
      mintSwitch.value = false;
      return;
    }

    // Next Epoch
    addLogHanlder(
      '下一次mint在: ' +
        dayjs(
          new BigNumber(newTokenConf[0].state.epochStartTime)
            .plus(newTokenConf[0].epochDuration)
            .plus(epochGapSec)
            .times(1e3)
            .toNumber(),
        ).format('YYYY-MM-DD HH:mm:ss'),
    );

    await sleep(
      new BigNumber(newTokenConf[0].state.epochStartTime)
        .plus(newTokenConf[0].epochDuration)
        .plus(epochGapSec)
        .minus(Date.now() / 1e3)
        .times(1e3)
        .toNumber(),
    );

    if (!mintSwitch.value) {
      return;
    }

    runMint();
  };

  const minting = ref(false);
  const mintSwitch = ref(false);
  const mintHandler = async () => {
    if (!privateKeyString.value) {
      return message.error('请填入私钥');
    }

    if (!mintArgs.value.tokenName) {
      return message.error('请填入铭文名称');
    }

    if (!mintArgs.value.mintSubAmountPerAccountInOneEpoch) {
      return message.error('请填入每个Epoch Mint次数');
    }

    if (!mintArgs.value.mintSubAmountPerAccountInOneEpoch) {
      return message.error('请填入同时mint的子账户数');
    }

    try {
      minting.value = true;
      const { address, transactionHash }: any = await mint(privateKeyString.value, mintArgs.value);
      addLogHanlder(successLog(transactionHash, address));
    } finally {
      minting.value = false;
    }
  };

  const startMintHandler = () => {
    if (mintSwitch.value) return;

    addLogHanlder('Mint启动');
    mintSwitch.value = true;
    runMint();
  };
  const stopMintHandler = () => {
    if (!mintSwitch.value) return;
    mintSwitch.value = false;
    addLogHanlder('Mint已停止');
    addLogHanlder('----------------------------');
  };

  const creating = ref(false);
  const createSubAccountHandler = async () => {
    if (!privateKeyString.value) {
      return message.error('请填入私钥');
    }

    if (!initializeAmountOfSubAccount.value) {
      return message.error('请填入初始化子账户数量');
    }

    try {
      creating.value = true;
      await createSubAccount(privateKeyString.value, initializeAmountOfSubAccount.value);
      initializeAmountOfSubAccount.value = 0;
      message.success('初始化账户成功!');
      checkSubAccountHandler();
    } catch (e: any) {
      message.error(e.message || '初始化账户失败');
    } finally {
      creating.value = false;
    }
  };

  const addLogHanlder = (msg: string) => {
    logs.value.unshift(`${msg}. \t ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\r`);
    logs.value = [...logs.value];
  };

  const subAccountsList = ref<any[]>([]);
  const checkSubAccountHandler = async () => {
    if (!privateKeyString.value) {
      return message.error('请填入私钥');
    }

    const result: any = await checkSubAccount(privateKeyString.value);
    currentSubAccountAmount.value = result[0];

    if (currentSubAccountAmount.value > 0) {
      const subAccountsResult: any = await getSubAccount(privateKeyString.value);
      subAccountsList.value = subAccountsResult[0];
    }
  };
</script>

<route lang="yaml">
meta:
  layout: default
</route>

