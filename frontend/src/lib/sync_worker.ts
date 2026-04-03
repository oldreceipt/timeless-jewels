import { expose } from 'comlink';
import '../wasm_exec.js';
import { loadSkillTree, passiveToTree } from './skill_tree';
import type { SearchWithSeed, ReverseSearchConfig, SearchResults, SimilarSeedsConfig, SimilarSeedResult } from './skill_tree';
import { calculator, data, initializeCrystalline } from './types';

const obj = {
  boot(wasm: ArrayBuffer) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const go = new Go();
    WebAssembly.instantiate(wasm, go.importObject).then((result) => {
      go.run(result.instance);

      initializeCrystalline();

      loadSkillTree();
    });
  },
  async search(args: ReverseSearchConfig, callback: (seed: number) => Promise<void>): Promise<SearchResults> {
    const searchResult = await calculator.ReverseSearch(
      args.nodes,
      args.stats.map((s) => s.id),
      args.jewel,
      args.conqueror,
      callback
    );

    const searchGrouped: { [key: number]: SearchWithSeed[] } = {};
    Object.keys(searchResult).forEach((seedStr) => {
      const seed = parseInt(seedStr);

      let weight = 0;

      const statCounts: Record<number, number> = {};
      const skills = Object.keys(searchResult[seed]).map((skillIDStr) => {
        const skillID = parseInt(skillIDStr);
        Object.keys(searchResult[seed][skillID]).forEach((st) => {
          const n = parseInt(st);
          statCounts[n] = (statCounts[n] || 0) + 1;
          weight += args.stats.find((s) => s.id == n)?.weight || 0;
        });

        return {
          passive: passiveToTree[skillID],
          stats: searchResult[seed][skillID]
        };
      });

      const len = Object.keys(searchResult[seed]).length;
      searchGrouped[len] = [
        ...(searchGrouped[len] || []),
        {
          skills: skills,
          seed,
          weight,
          statCounts
        }
      ];
    });

    Object.keys(searchGrouped).forEach((len) => {
      const nLen = parseInt(len);
      searchGrouped[nLen] = searchGrouped[nLen].filter((g) => {
        if (g.weight < args.minTotalWeight) {
          return false;
        }

        for (const stat of args.stats) {
          if ((g.statCounts[stat.id] === undefined && stat.min > 0) || g.statCounts[stat.id] < stat.min) {
            return false;
          }
        }

        return true;
      });

      if (Object.keys(searchGrouped[nLen]).length == 0) {
        delete searchGrouped[nLen];
      } else {
        searchGrouped[nLen] = searchGrouped[nLen].sort((a, b) => b.weight - a.weight);
      }
    });

    return {
      grouped: searchGrouped,
      raw: Object.keys(searchGrouped)
        .map((x) => searchGrouped[parseInt(x)])
        .flat()
        .sort((a, b) => b.weight - a.weight)
    };
  },
  async findSimilar(
    args: SimilarSeedsConfig,
    callback: (seed: number) => Promise<void>
  ): Promise<SimilarSeedResult[]> {
    const getNodeStatIds = (passiveIndex: number, seed: number): Set<number> => {
      const ids = new Set<number>();
      const result = calculator.Calculate(passiveIndex, seed, args.jewel, args.conqueror);
      result.AlternatePassiveSkill?.StatsKeys?.forEach((k) => ids.add(k));
      result.AlternatePassiveAdditionInformations?.forEach((info) =>
        info.AlternatePassiveAddition?.StatsKeys?.forEach((k) => ids.add(k))
      );
      return ids;
    };

    const getStatFingerprint = (seed: number): Set<number> => {
      const stats = new Set<number>();
      for (const nodeIndex of args.nodes) {
        for (const id of getNodeStatIds(nodeIndex, seed)) stats.add(id);
      }
      return stats;
    };

    const usePinnedNodes = args.pinnedNodes?.length > 0;
    const currentStats = usePinnedNodes ? null : getStatFingerprint(args.seed);
    const maxScore = usePinnedNodes ? args.pinnedNodes.length : currentStats.size;

    const range = data.TimelessJewelSeedRanges[args.jewel];
    const results: SimilarSeedResult[] = [];

    for (let s = range.Min; s <= range.Max; s++) {
      if (s === args.seed) continue;

      if (s % 1000 === 0) {
        await callback(s);
      }

      let score = 0;
      if (usePinnedNodes) {
        for (const pinned of args.pinnedNodes) {
          const candidateIds = getNodeStatIds(pinned.passiveIndex, s);
          const matches =
            pinned.statIds.length === 0
              ? candidateIds.size === 0
              : candidateIds.size === pinned.statIds.length &&
                pinned.statIds.every((id) => candidateIds.has(id));
          if (matches) score++;
        }
      } else {
        const candidateStats = getStatFingerprint(s);
        for (const id of currentStats) {
          if (candidateStats.has(id)) score++;
        }
      }

      if (score === 0) continue;

      results.push({ seed: s, score, maxScore });

      if (results.length > args.topN * 4) {
        results.sort((a, b) => b.score - a.score);
        results.splice(args.topN * 2);
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, args.topN);
  }
} as const;

expose(obj);

export type WorkerType = typeof obj;
