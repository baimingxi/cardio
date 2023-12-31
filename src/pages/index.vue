<template>
  <div class="flex-col mb-2">
    <span class="text-red text-xs">
      由于官方节点不稳定, 可能数据查询不准确. Mint & 归集可能都存在延迟或者失败. 请稍后重试.
    </span>
    <span class="text-red text-xs">已 Mint 的资产都保存于链上, 不会丢失</span>
  </div>
  <Form layout="vertical">
    <FormItem label="主网钱包私钥">
      <Input v-model:value="privateKeyString" type="password" />
      <div class="mt-1">私钥: {{ ShortAddress(privateKeyString) }}</div>
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
          <Button @click="checkSubAccountHandler" :loading="checking">查询子账户</Button>
        </div>
      </div>
    </FormItem>

    <div class="flex-col gap-1 w-full" v-if="subAccountsList.length > 0">
      <span>子账户列表:</span>
      <div class="flex gap-2 w-full">
        <div
          class="flex-col flex-1 gap-1 p-4 rounded-2 border-1 bordedr-solid border-accent bg-secondary/10 max-h-100 overflow-y-auto mb-3"
        >
          <span
            class="flex justify-between items-center w-full hover:bg-secondary/40 transion-all p-2"
            v-for="(account, index) in subAccountsList"
            :key="index"
          >
            <div class="flex gap-2 items-center">
              <!-- <Button @click="nftOfsingleAddress(account)" :loading="checking">单独查询</Button> -->
              <a
                class="underline"
                target="_blank"
                :href="`https://explorer.aptoslabs.com/account/${account}?network=${network}`"
              >
                {{ account }}
              </a>
            </div>
            <div class="flex-col">
              <span
                v-for="(ticker, tid) in Object.keys(nftAmountListWithIndex[index]?.tokenMap || {})"
                :key="tid"
              >
                {{ ticker }}: {{ nftAmountListWithIndex[index]?.tokenMap?.[ticker] }}
              </span>
            </div>
          </span>
        </div>
        <div class="flex-col w-40">
          <span class="mb-2">当前子账户铭文总数:</span>
          <span v-for="name in Object.keys(nftAmountSummary)" :key="name">
            {{ name }}: {{ new BigNumber(nftAmountSummary[name] || 0).toFormat() }}
          </span>
        </div>
      </div>
    </div>

    <FormItem label="" v-if="subAccountsList.length > 0">
      <span>
        一键归集所有子账号铭文到主帐号(操作后请重新查询子账户列表.否则可能会出现归集报错.但不会影响资产)
      </span>
      <div class="flex flex-wrap gap-2">
        <Button
          @click="gatherHandler(name)"
          :loading="gathering || checking"
          v-for="name in Object.keys(nftAmountSummary)"
          :key="name"
        >
          {{ name }}的铭文
        </Button>
      </div>
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
    <FormItem
      label="子账户在每个 Epoch 中 Mint 的次数 （每个 Epoch 发送 txn 数量 =  同时mint的子账户数 * 次数）"
    >
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
  import { ShortAddress, sleep } from '@/utils';
  import { Button, Form, FormItem, Input, InputNumber, Textarea, message } from 'ant-design-vue';
  import BigNumber from 'bignumber.js';
  import dayjs from 'dayjs';

  const logs = ref<string[]>([]);
  const {
    createSubAccount,
    checkSubAccount,
    getSubAccount,
    getOwnersNFTs,
    mint,
    getInscriptionConf,
    gatherSubAccount,
  } = useContract();

  const privateKeyString = ref('');
  const currentSubAccountAmount = ref(0);
  const initializeAmountOfSubAccount = ref(0);
  const network = import.meta.env.VITE_APP_NETWORK;

  const mintArgs = ref<any>({
    tokenName: 'APTS',
    mintSubAmountPerAccountInOneEpoch: 0,
    mintSubAccountAmount: 0,
  });

  const successLog = (transactionHash: string, address: string) =>
    `✅ ${address} 创建交易成功, \t 交易hash: ${transactionHash}`;

  // 1. get epoch
  // 2. mint in current epoch if token isn't ended (currentEpoch < totalEpoch-1 || (currentEpoch == totalEpoch - 1 && epoch still run))
  // 3. if currentTime > endtime, goto 1

  const epochGapSec = 2;
  const runMint = async (): Promise<any> => {
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
      } catch (e: any) {
        addLogHanlder(e.message);
      } finally {
        newTokenConf = await getInscriptionConf(mintArgs.value.tokenName);
        addLogHanlder(
          '当前Epoch: ' +
            Number(newTokenConf[0].state.currentEpoch) +
            ', 总共Epoch个数: ' +
            newTokenConf[0].epochCount,
        );
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

    return runMint();
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
  const checking = ref(false);
  const checkSubAccountHandler = async () => {
    if (checking.value) return;
    if (!privateKeyString.value) {
      return message.error('请填入私钥');
    }

    try {
      checking.value = true;
      currentSubAccountAmount.value = 0;
      const result: any = await checkSubAccount(privateKeyString.value);
      currentSubAccountAmount.value = result[0];

      subAccountsList.value = [];
      if (currentSubAccountAmount.value > 0) {
        const subAccountsResult: any = await getSubAccount(privateKeyString.value);
        subAccountsList.value = subAccountsResult[0];
        await nftsAmountOfAddress();
      }

      message.success('查询子账户结果更新成功');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      checking.value = false;
    }
  };

  const nftAmountListWithIndex = ref<any[]>([]);
  const nftAmountSummary = computed(() => {
    let NFTMap = nftAmountListWithIndex.value.reduce((prev: any, current: any) => {
      Object.keys(current.tokenMap).forEach((tick: string) => {
        if (!prev[tick]) {
          prev[tick] = 0;
        }

        prev[tick] = new BigNumber(prev[tick] || 0).plus(current.tokenMap[tick]).toNumber();
      });
      return prev;
    }, {});

    return NFTMap;
  });

  const nftOfsingleAddress = async (address: string) => {
    let index = subAccountsList.value.indexOf(address);
    var token_data_ids: any[] = [];
    var tokenMap: any = {};

    if (index > -1) {
      const r: any = await getOwnersNFTs(address);

      r?.data?.current_token_datas_v2.forEach((data: any) => {
        if (data.token_properties.amt > 1) {
          token_data_ids.push({
            name: data?.token_properties?.tick,
            token_data_id: data.token_data_id,
          });

          if (!tokenMap[data.token_properties.tick]) {
            tokenMap[data.token_properties.tick] = 0;
          }

          tokenMap[data.token_properties.tick] = new BigNumber(
            tokenMap[data.token_properties.tick] || 0,
          )
            .plus(data.token_properties.amt)
            .toNumber();
        }
      });
    }
    return {
      token_data_ids,
      tokenMap,
    };
  };

  const nftsAmountOfAddress = async () => {
    nftAmountListWithIndex.value = [];
    for (const subAccountAddress of subAccountsList.value) {
      let token_data_ids: any[] = [];
      let tokenMap: any = {};
      await sleep(100);

      try {
        const data = await nftOfsingleAddress(subAccountAddress);
        nftAmountListWithIndex.value[subAccountsList.value.indexOf(subAccountAddress)] = data;
      } catch (e) {
        console.log(e);
        nftAmountListWithIndex.value[subAccountsList.value.indexOf(subAccountAddress)] = {
          token_data_ids,
          tokenMap,
        };
      }
    }
  };

  const gathering = ref(false);
  const maxArrayAmount = 500;
  const gatherHandler = async (name: string) => {
    if (gathering.value) return;
    if (!privateKeyString.value) {
      return message.error('请填入私钥');
    }

    if (subAccountsList.value.length == 0) {
      return message.error('请先查询子账户');
    }

    try {
      gathering.value = true;
      let indexs: any = [];
      let nfts: any = [];

      subAccountsList.value.forEach((_: string, index: number) => {
        if (nftAmountListWithIndex.value[index]?.token_data_ids?.length > 0) {
          const dataFilterByName = nftAmountListWithIndex.value[index]?.token_data_ids?.filter(
            (data: any) => data.name === name,
          );

          if (dataFilterByName.length !== 0) {
            indexs.push(index);
            nfts.push(dataFilterByName.map((_: any) => _.token_data_id));
          }
        }
      });

      // batch gather sub account nfts
      // by nfts account maximum 500
      let i = 0;
      let continueGather = true;
      do {
        if (typeof indexs[i] == 'undefined' || !nfts[i]) {
          continueGather = false;
          break;
        }

        let totalnftAmount = 0;
        let j = i;
        let payload: any = { indexs: [], nfts: [] };

        for (; j <= nfts.length; j++) {
          if (j == nfts.length) {
            payload.indexs = indexs.slice(i, j);
            payload.nfts = nfts.slice(i, j);
            i = j;
            continueGather = false;
            console.log(payload);
            try {
              await gatherSubAccount(privateKeyString.value, payload);
              message.success('一批子账户归集成功! 全部归集完毕之后请重新查询子账户列表.');
            } catch {}
          } else {
            totalnftAmount += nfts[j].length;
            console.log(totalnftAmount);
            if (totalnftAmount > maxArrayAmount) {
              payload.indexs = indexs.slice(i, j - 1);
              payload.nfts = nfts.slice(i, j - 1);
              i = j - 1;
              try {
                await gatherSubAccount(privateKeyString.value, payload);
                message.success('一批子账户归集成功! 全部归集完毕之后请重新查询子账户列表.');
              } catch {}
              break;
            }
          }
        }
      } while (continueGather);

      message.success('归集操作完成. 自动重新查询子账户资产');
      checkSubAccountHandler();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      gathering.value = false;
    }
  };
</script>

<route lang="yaml">
meta:
  layout: default
</route>

