// The economy: Counter-Strike-style money. Start poor, earn for kills, wins and the
// objective, spend between rounds. The buy menu only opens during the buy phase, and
// every price is shown before the player commits.
export const PRICES = {
  rifle: 2700, smg: 1500, shotgun: 1700, grenade: 300, armor: 650,
};

export function createEconomy() {
  const state = { money: 800, grenades: 0, armor: 0, kills: 0 };

  return {
    state,
    reset() {
      state.money = 800;
      state.grenades = 0;
      state.armor = 0;
      state.kills = 0;
    },
    earn(amount) { state.money += amount; },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    roundEnd(won, plantedByPlayer) {
      state.money += won ? 3250 : 1900;
      if (plantedByPlayer) state.money += 300;
    },
    buyGrenade() {
      if (state.grenades >= 1 || !this.spend(PRICES.grenade)) return false;
      state.grenades = 1;
      return true;
    },
    buyArmor() {
      if (state.armor >= 100 || !this.spend(PRICES.armor)) return false;
      state.armor = 100;
      return true;
    },
    useGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
  };
}
