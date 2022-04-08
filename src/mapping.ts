import { Address, BigInt } from '@graphprotocol/graph-ts';
import { CreateDCA } from '../generated/DcaFactory/DcaFactory';
import { LogTransfer, Bentobox } from '../generated/Bentobox/Bentobox';
import { ExecutedOrder, Factory, Vault } from '../generated/schema';
import { ExecuteDCA, DcaVault as Dca, Withdraw } from '../generated/templates/DcaVault/DcaVault';
import { DcaVault } from '../generated/templates';
import { FACTORY } from './constant';
import { log } from '@graphprotocol/graph-ts';

function getOrCreateFactory(): Factory {
  let factory = Factory.load(FACTORY);

  if (factory === null) {
    factory = new Factory(FACTORY);
    factory.save();
  }
  return factory;
}

function createExecutedOrder(event: ExecuteDCA, vault: Vault): void {
  let executedOrder = new ExecutedOrder(event.transaction.hash.toHex());

  executedOrder.amount = event.params.amount;
  executedOrder.timestamp = event.params.timestamp;
  executedOrder.vault = vault.id;

  executedOrder.save();
}

export function handleLogTransfer(event: LogTransfer): void {
  let vault = Vault.load(event.params.to.toHex());
  if (vault === null || event.params.token.toHex() != vault.sellToken.toHex()) {
    return;
  }
  const bento = Bentobox.bind(event.address);
  const amount = bento.toAmount(Address.fromBytes(vault.sellToken), event.params.share, false);
  vault.balance = vault.balance.plus(amount);
  if (vault.balance.ge(vault.amount)) {
    vault.enoughBalanceToExecute = true;
  }
  vault.save();
}

export function handleCreateDCA(event: CreateDCA): void {
  DcaVault.create(event.params.newVault);
  let vault = new Vault(event.params.newVault.toHex());
  vault.factory = getOrCreateFactory().id;

  const newVault = Dca.bind(event.params.newVault);
  vault.buyToken = newVault.buyToken();
  vault.sellToken = newVault.sellToken();
  const dcaData = newVault.dcaData();
  vault.sellTokenPriceFeed = dcaData.value0;
  vault.buyTokenPriceFeed = dcaData.value1;
  vault.epochDuration = dcaData.value2;
  vault.amount = dcaData.value4;

  vault.save();
}

export function handleExecuteDCA(event: ExecuteDCA): void {
  let address = event.transaction.to;
  if (address === null) {
    return;
  }

  let vault = Vault.load(address.toHex());
  if (vault === null) {
    return;
  }

  vault.nextExecutableTimestamp = event.params.timestamp.plus(vault.epochDuration);
  vault.totalSell = vault.totalSell.plus(vault.amount);
  vault.totalBuy = vault.totalBuy.plus(event.params.amount);
  vault.balance = vault.balance.minus(vault.amount);
  if (vault.balance.lt(vault.amount)) {
    vault.enoughBalanceToExecute = false;
  }

  createExecutedOrder(event, vault);

  vault.save();
}

export function handleWithdraw(event: Withdraw): void {
  let vault = Vault.load(event.address.toHex());
  if (vault === null) {
    return;
  }

  const bento = Bentobox.bind(Address.fromString('0x0319000133d3ada02600f0875d2cf03d442c3367'));
  const amount = bento.toAmount(Address.fromBytes(vault.sellToken), event.params.share, false);
  vault.balance = vault.balance.minus(amount);
  if (vault.balance.lt(vault.amount)) {
    vault.enoughBalanceToExecute = false;
  }
  vault.save();
}
