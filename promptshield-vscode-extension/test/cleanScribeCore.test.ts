import { fnv1a32, scanDocument, initializeBloomFilter } from "../src/cleanScribeCore";
import * as path from "path";

// Initialize the Bloom filter from the compiled seed data before tests run
const filterPath = path.resolve(__dirname, "..", "resources", "filter.bin");
initializeBloomFilter(filterPath);

describe("cleanScribeCore", () => {
  it("returns no violations for a clean code snippet", () => {
    const cleanCode = `
      const subtotal = 42;
      const tax = 8;
      const total = subtotal + tax;
      console.log(total);
    `;

    const violations = scanDocument(cleanCode);

    expect(violations).toHaveLength(0);
  });

  it("returns a violation for code structurally matching the seed GPL binary tree", () => {
    // This code structurally mirrors the seed gpl-binary-tree.js logic
    // with renamed variables to simulate AI evasion
    const plagiarizedCode = `
      function makeEntry(v) {
        return { v: v, l: null, r: null };
      }

      function addEntry(tree, v) {
        if (tree === null) {
          return makeEntry(v);
        }

        if (v < tree.v) {
          tree.l = addEntry(tree.l, v);
        } else if (v > tree.v) {
          tree.r = addEntry(tree.r, v);
        }

        return tree;
      }

      function findEntry(tree, target) {
        if (tree === null) {
          return false;
        }

        if (target === tree.v) {
          return true;
        }

        if (target < tree.v) {
          return findEntry(tree.l, target);
        }

        return findEntry(tree.r, target);
      }

      function walkInOrder(tree, arr) {
        if (tree === null) {
          return;
        }

        walkInOrder(tree.l, arr);
        arr.push(tree.v);
        walkInOrder(tree.r, arr);
      }

      function smallest(tree) {
        if (tree === null) {
          throw new Error("Empty");
        }

        let cur = tree;
        while (cur.l !== null) {
          cur = cur.l;
        }

        return cur.v;
      }
    `;

    const violations = scanDocument(plagiarizedCode);

    const gplViolations = violations.filter((v) => v.violationType === "restricted-gpl-similarity");
    expect(gplViolations.length).toBeGreaterThanOrEqual(1);
  });

  it("returns a violation for explicit GPL-family license notices", () => {
    const gplNoticeCode = `
      /*
       * SPDX-License-Identifier: GPL-3.0-or-later
       */
      export const featureFlag = true;
    `;

    const violations = scanDocument(gplNoticeCode);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      line: 3,
      violationType: "copyleft-license-notice",
      severity: "critical"
    });
  });

  it("returns a violation for generic copyleft structural signatures", () => {
    const schedulerLikeCode = `
      function makeEntry(v) {
        return { val: v, left: null, right: null };
      }
      function addEntry(tree, v) {
        if (tree === null) {
          return makeEntry(v);
        }
        if (v < tree.val) {
          tree.left = addEntry(tree.left, v);
        } else if (v > tree.val) {
          tree.right = addEntry(tree.right, v);
        }
        return tree;
      }
    `;

    const violations = scanDocument(schedulerLikeCode);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.violationType).toBe("restricted-gpl-similarity");
    expect(violations[0]?.severity).toBe("critical");
  });

  it("returns regex findings for secret patterns", () => {
    const codeWithSecret = `
      const apiKey = "sk-1234567890abcdefghijklmnop";
    `;

    const violations = scanDocument(codeWithSecret);

    const secretViolations = violations.filter((v) => v.violationType === "openai-api-key");
    expect(secretViolations.length).toBeGreaterThanOrEqual(1);
  });

  it("returns a stable FNV-1a 32-bit hash for the same string", () => {
    const input = "Program_FunctionDeclaration";
    const firstHash = fnv1a32(input);
    const secondHash = fnv1a32(input);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toBe(1836718064);
  });

  it("detects copyleft license text in Python-style comments", () => {
    const pythonLicenseCode = `
      # This program is free software: you can redistribute it
      # under the GNU General Public License
      def hello():
          print("world")
    `;

    const violations = scanDocument(pythonLicenseCode);

    const licenseViolations = violations.filter((v) => v.violationType === "copyleft-license-notice");
    expect(licenseViolations.length).toBeGreaterThanOrEqual(1);
  });

  it("handles extremely small, empty, or whitespace-only code blocks cleanly", () => {
    expect(scanDocument("")).toHaveLength(0);
    expect(scanDocument("   ")).toHaveLength(0);
    expect(scanDocument("\n\n\t")).toHaveLength(0);
    expect(scanDocument("let a;")).toHaveLength(0);
  });

  it("ignores GPL keywords inside string literals, complex escapes, and comments", () => {
    const codeWithDocstring = `
      """
      This is a multi-line docstring containing restricted words:
      class, def, function, while, return, GPL notice
      """
      # A single-line comment containing def, for, return, GPL
      const customString = "GPL 3.0 license is free software";
      const escapedStr = "escaped \\\" quotes \\' and backslashes \\\\ with keywords def try";
      
      const cleanVar = 42;
    `;
    const violations = scanDocument(codeWithDocstring);
    expect(violations.filter(v => v.violationType === "copyleft-license-notice")).toHaveLength(0);
    expect(violations.filter(v => v.violationType === "restricted-gpl-similarity")).toHaveLength(0);
  });

  it("safely processes non-ASCII characters, emojis, and unicode symbols in comments/identifiers", () => {
    const unicodeCode = `
      // Unicode comment: 🌟 Special 💻 compliance 🛡️ scan
      const identifier🏆 = "Unicode 🌍 String";
      function doAction🚀() {
        return "Done ✅";
      }
    `;
    const violations = scanDocument(unicodeCode);
    expect(violations.filter(v => v.violationType === "restricted-gpl-similarity")).toHaveLength(0);
  });

  it("scans properly at the boundary token count of exactly 40 tokens", () => {
    // Generate a clean snippet of exactly 40 tokens
    const exactly40Tokens = `
      const sub = 1;
      const tax = 2;
      const total = sub + tax;
      if (total > 0) {
        console.log(total);
      } else {
        return null;
      } ; ;
    `;
    const violations = scanDocument(exactly40Tokens);
    expect(violations.filter(v => v.violationType === "restricted-gpl-similarity")).toHaveLength(0);
  });

  it("detects structurally plagiarized multi-language code (Python Dijkstra) with renamed variables", () => {
    // This is the Dijkstra algorithm from seed-sources/gpl-graph-algorithms.py with renamed variables
    const pythonPlagiarism = `
      def computePaths(self, originPoint):
          import heapq

          shortestPaths = {node: float('inf') for node in self.adjacency}
          shortestPaths[originPoint] = 0
          activeQueue = [(0, originPoint)]
          predecessors = {node: None for node in self.adjacency}

          while activeQueue:
              currentCost, currentItem = heapq.heappop(activeQueue)

              if currentCost > shortestPaths[currentItem]:
                  continue

              for vertexNeighbor, pathWeight in self.adjacency.get(currentItem, []):
                  newCost = currentCost + pathWeight

                  if newCost < shortestPaths[vertexNeighbor]:
                      shortestPaths[vertexNeighbor] = newCost
                      predecessors[vertexNeighbor] = currentItem
                      heapq.heappush(activeQueue, (newCost, vertexNeighbor))

          return shortestPaths, predecessors
    `;
    const violations = scanDocument(pythonPlagiarism);
    const similarityViolations = violations.filter(v => v.violationType === "restricted-gpl-similarity");
    expect(similarityViolations.length).toBeGreaterThanOrEqual(1);
  });

  it("detects structurally plagiarized Go Linked List Operations with renamed variables", () => {
    // This replicates LinkedList Reverse and HasCycle from seed-sources/gpl-linked-list.go with renamed variables
    const goPlagiarism = `
      package customlist

      type Element struct {
          Val  int
          Next *Element
      }

      type Chain struct {
          Start *Element
          Count int
      }

      func (c *Chain) InvertList() {
          var previousElement *Element
          currentElement := c.Start

          for currentElement != nil {
              followingElement := currentElement.Next
              currentElement.Next = previousElement
              previousElement = currentElement
              currentElement = followingElement
          }

          c.Start = previousElement
      }

      func (c *Chain) DetectLoop() bool {
          if c.Start == nil {
              return false
          }

          tortoise := c.Start
          hare := c.Start

          for hare != nil && hare.Next != nil {
              tortoise = tortoise.Next
              hare = hare.Next.Next

              if tortoise == hare {
                  return true
              }
          }

          return false
      }
    `;
    const violations = scanDocument(goPlagiarism);
    const similarityViolations = violations.filter(v => v.violationType === "restricted-gpl-similarity");
    expect(similarityViolations.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // MASSIVE 50-EDGE-CASE DATA-DRIVEN COMPLIANCE SUITE (HACKATHON MVP)
  // =========================================================================
  interface ComplianceTestCase {
    readonly name: string;
    readonly code: string;
    readonly expectedViolationType: string | null;
  }

  const complianceTestCases: readonly ComplianceTestCase[] = [
    // --- 1 to 10: GPL-Family Copyleft Headers ---
    {
      name: "GPL-3.0 SPDX Notice in JS",
      code: `// SPDX-License-Identifier: GPL-3.0-only\nconst version = "1.0";`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GPL-2.0 Block Notice in JS",
      code: `/* GNU General Public License version 2 */\nconst port = 8080;`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "AGPL-3.0 Comment Notice in Python",
      code: `# This program is free software: you can redistribute it under GNU AGPL\nport = 5000`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "LGPL-3.0 SPDX Notice in TS",
      code: `/* SPDX-License-Identifier: LGPL-3.0-or-later */\nexport const run = () => {};`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GPL-3.0 License Release Statement",
      code: `// Licensed under the GPL-3.0 License\nconst flag = true;`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GNU GPL Free Software Redistribution Statement",
      code: `// This program is free software: you can redistribute it and/or modify it under the GPL`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GNU Affero General Public License Text",
      code: `/* GNU Affero General Public License */\nconst app = "server";`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GPL-2.0 SPDX Statement in Go",
      code: `// SPDX-License-Identifier: GPL-2.0-only\npackage main`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "GNU Lesser General Public License Text",
      code: `// Released under the GNU Lesser General Public License\nconst size = 64;`,
      expectedViolationType: "copyleft-license-notice"
    },
    {
      name: "Generic GNU GPL Header in C-Style",
      code: `/* GNU General Public License */\nconst dev = true;`,
      expectedViolationType: "copyleft-license-notice"
    },

    // --- 11 to 20: Permissive Allowed Headers (MIT, Apache, BSD, ISC, etc.) ---
    {
      name: "MIT License SPDX Header",
      code: `// SPDX-License-Identifier: MIT\nconst host = "localhost";`,
      expectedViolationType: null
    },
    {
      name: "Apache 2.0 Copyright Notice",
      code: `/* Licensed under the Apache License, Version 2.0 */\nconst data = {};`,
      expectedViolationType: null
    },
    {
      name: "BSD 3-Clause Header",
      code: `/* BSD 3-Clause License */\nconst key = "value";`,
      expectedViolationType: null
    },
    {
      name: "ISC License SPDX Header",
      code: `// SPDX-License-Identifier: ISC\nconst id = 12345;`,
      expectedViolationType: null
    },
    {
      name: "Unlicense/Public Domain Notice",
      code: `// Public Domain / Unlicense\nlet x = 10;`,
      expectedViolationType: null
    },
    {
      name: "CC0 1.0 Universal Statement",
      code: `/* CC0 1.0 Universal */\nconst name = "free";`,
      expectedViolationType: null
    },
    {
      name: "BSD 2-Clause SPDX Header",
      code: `# SPDX-License-Identifier: BSD-2-Clause\nversion = 1.0`,
      expectedViolationType: null
    },
    {
      name: "Apache-2.0 Text Statement",
      code: `// Apache-2.0 license notice\nconst ok = true;`,
      expectedViolationType: null
    },
    {
      name: "MIT License Copyright Statement",
      code: `/* MIT License Copyright (c) 2026 */\nlet size = 12;`,
      expectedViolationType: null
    },
    {
      name: "ISC License Block Statement",
      code: `/* ISC License */\nconst config = {};`,
      expectedViolationType: null
    },

    // --- 21 to 35: Plagiarized Copyleft Structures (Without Headers) ---
    {
      name: "Renamed Binary Tree Node Search (JS Plagiarism)",
      code: `
        function getRecord(node, key) {
          if (node === null) return false;
          if (key === node.v) return true;
          if (key < node.v) {
            return getRecord(node.l, key);
          }
          return getRecord(node.r, key);
        }
        function outputValues(node, array) {
          if (node === null) return;
          outputValues(node.l, array);
          array.push(node.v);
          outputValues(node.r, array);
        }
        function minNodeVal(node) {
          if (node === null) throw new Error("empty");
          let current = node;
          while (current.l !== null) {
            current = current.l;
          }
          return current.v;
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go Linked List Invert (Go Plagiarism)",
      code: `
        package mylist
        type Node struct {
          Value int
          Next *Node
        }
        type List struct {
          Start *Node
          Count int
        }
        func (l *List) Invert() {
          var prev *Node
          curr := l.Start
          for curr != nil {
            nxt := curr.Next
            curr.Next = prev
            prev = curr
            curr = nxt
          }
          l.Start = prev
        }
        func (l *List) HasLoop() bool {
          if l.Start == nil { return false }
          slow := l.Start
          fast := l.Start
          for fast != nil && fast.Next != nil {
            slow = slow.Next
            fast = fast.Next.Next
            if slow == fast { return true }
          }
          return false
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python BFS Graph Traversal (Python Plagiarism)",
      code: `
        from collections import deque
        class WebGraph:
            def __init__(self):
                self.links = {}
            def add_site(self, site):
                if site not in self.links:
                    self.links[site] = []
            def search_bfs(self, origin):
                seen = set()
                que = deque([origin])
                seen.add(origin)
                path = []
                while que:
                    node = que.popleft()
                    path.append(node)
                    for adjacency_node, _ in self.links.get(node, []):
                        if adjacency_node not in seen:
                            seen.add(adjacency_node)
                            que.append(adjacency_node)
                return path
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python DFS Recursive (Python Plagiarism)",
      code: `
        class TargetGraph:
            def __init__(self):
                self.links = {}
            def traverse_dfs(self, root):
                visited_nodes = set()
                path_nodes = []
                self._recurse_dfs(root, visited_nodes, path_nodes)
                return path_nodes
            def _recurse_dfs(self, cur, visited, path):
                visited.add(cur)
                path.append(cur)
                for neighbor, _ in self.links.get(cur, []):
                    if neighbor not in visited:
                        self._recurse_dfs(neighbor, visited, path)
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python Dijkstra Logic (Python Plagiarism)",
      code: `
        class MetricGraph:
            def __init__(self):
                self.links = {}
            def shortest_path(self, source):
                import heapq
                weights = {v: float('inf') for v in self.links}
                weights[source] = 0
                pq = [(0, source)]
                prev_nodes = {v: None for v in self.links}
                while pq:
                    dist, vertex = heapq.heappop(pq)
                    if dist > weights[vertex]:
                        continue
                    for adj, weight in self.links.get(vertex, []):
                        new_dist = dist + weight
                        if new_dist < weights[adj]:
                            weights[adj] = new_dist
                            prev_nodes[adj] = vertex
                            heapq.heappush(pq, (new_dist, adj))
                return weights, prev_nodes
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python Topological Sort (Python Plagiarism)",
      code: `
        class DirectedMap:
            def __init__(self):
                self.links = {}
            def sort_topological(self):
                visited = set()
                stack_list = []
                for node in self.links:
                    if node not in visited:
                        self._sort_util(node, visited, stack_list)
                return stack_list[::-1]
            def _sort_util(self, node, visited, stack):
                visited.add(node)
                for adj, _ in self.links.get(node, []):
                    if adj not in visited:
                        self._sort_util(adj, visited, stack)
                stack.append(node)
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python Cycle Search (Python Plagiarism)",
      code: `
        class CycleDetector:
            def __init__(self):
                self.links = {}
            def check_cycle(self):
                visited = set()
                recursion_stack = set()
                for node in self.links:
                    if node not in visited:
                        if self._cycle_util(node, visited, recursion_stack):
                            return True
                return False
            def _cycle_util(self, node, visited, rec_stack):
                visited.add(node)
                rec_stack.add(node)
                for adj, _ in self.links.get(node, []):
                    if adj not in visited:
                        if self._cycle_util(adj, visited, rec_stack):
                            return True
                    elif adj in rec_stack:
                        return True
                rec_stack.discard(node)
                return False
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Python Connected Components (Python Plagiarism)",
      code: `
        class SubGraphMap:
            def __init__(self):
                self.links = {}
            def get_subgraphs(self):
                visited = set()
                components = []
                for node in self.links:
                    if node not in visited:
                        comp = []
                        self._recurse_dfs(node, visited, comp)
                        components.append(comp)
                return components
            def _recurse_dfs(self, cur, visited, path):
                visited.add(cur)
                path.append(cur)
                for neighbor, _ in self.links.get(cur, []):
                    if neighbor not in visited:
                        self._recurse_dfs(neighbor, visited, path)
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go LinkedList InsertAtTail (Go Plagiarism)",
      code: `
        package mylist
        type Item struct {
          Val int
          Next *Item
        }
        type Chain struct {
          Head *Item
          Length int
        }
        func (c *Chain) AddTail(value int) {
          newItem := &Item{Val: value, Next: nil}
          if c.Head == nil {
            c.Head = newItem
            c.Length++
            return
          }
          curr := c.Head
          for curr.Next != nil {
            curr = curr.Next
          }
          curr.Next = newItem
          c.Length++
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go LinkedList RemoveDuplicates (Go Plagiarism)",
      code: `
        package mylist
        type Element struct {
          Val int
          Next *Element
        }
        type List struct {
          Head *Element
          Size int
        }
        func (l *List) ClearDupes() {
          if l.Head == nil { return }
          hashSet := make(map[int]bool)
          curr := l.Head
          hashSet[curr.Val] = true
          var previous *Element = curr
          curr = curr.Next
          for curr != nil {
            if hashSet[curr.Val] {
              previous.Next = curr.Next
              l.Size--
            } else {
              hashSet[curr.Val] = true
              previous = curr
            }
            curr = curr.Next
          }
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go LinkedList DeleteByValue (Go Plagiarism)",
      code: `
        package mylist
        type Element struct {
          Val int
          Next *Element
        }
        type List struct {
          Head *Element
          Size int
        }
        func (l *List) EraseValue(target int) bool {
          if l.Head == nil { return false }
          if l.Head.Val == target {
            l.Head = l.Head.Next
            l.Size--
            return true
          }
          curr := l.Head
          for curr.Next != nil {
            if curr.Next.Val == target {
              curr.Next = curr.Next.Next
              l.Size--
              return true
            }
            curr = curr.Next
          }
          return false
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go LinkedList Middle Node (Go Plagiarism)",
      code: `
        package mylist
        import "errors"
        type Node struct {
          Val int
          Next *Node
        }
        type List struct {
          Head *Node
        }
        func (l *List) FindMid() (int, error) {
          if l.Head == nil {
            return 0, errors.New("empty")
          }
          slow := l.Head
          fast := l.Head
          for fast != nil && fast.Next != nil {
            slow = slow.Next
            fast = fast.Next.Next
          }
          return slow.Val, nil
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed JS Binary Tree smallest (JS Plagiarism)",
      code: `
        function getSmallest(node) {
          if (node === null) {
            throw new Error("Empty");
          }
          let current = node;
          while (current.l !== null) {
            current = current.l;
          }
          return current.v;
        }
        function searchKey(node, key) {
          if (node === null) return false;
          if (key === node.v) return true;
          if (key < node.v) {
            return searchKey(node.l, key);
          }
          return searchKey(node.r, key);
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed JS Binary Tree addNode (JS Plagiarism)",
      code: `
        function createNode(v) {
          return { v: v, l: null, r: null };
        }
        function insertNode(tree, v) {
          if (tree === null) {
            return createNode(v);
          }
          if (v < tree.v) {
            tree.l = insertNode(tree.l, v);
          } else if (v > tree.v) {
            tree.r = insertNode(tree.r, v);
          }
          return tree;
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "Renamed Go LinkedList Search (Go Plagiarism)",
      code: `
        package mylist
        type Node struct {
          Val int
          Next *Node
        }
        type List struct {
          Head *Node
        }
        func (l *List) FindVal(target int) bool {
          curr := l.Head
          for curr != nil {
            if curr.Val == target {
              return true
            }
            curr = curr.Next
          }
          return false
        }
      `,
      expectedViolationType: "restricted-gpl-similarity"
    },

    // --- 36 to 45: Permitted Clean Code Complex Logic (Zero Violations) ---
    {
      name: "Fibonacci Memoized Logic in TS",
      code: `
        export function fibonacci(n: number, memo: Record<number, number> = {}): number {
          if (n <= 1) return n;
          if (n in memo) return memo[n];
          memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
          return memo[n];
        }
      `,
      expectedViolationType: null
    },
    {
      name: "QuickSort Logic in JS",
      code: `
        function quickSort(arr) {
          if (arr.length <= 1) return arr;
          const pivot = arr[arr.length - 1];
          const left = [];
          const right = [];
          for (let i = 0; i < arr.length - 1; i++) {
            if (arr[i] < pivot) left.push(arr[i]);
            else right.push(arr[i]);
          }
          return [...quickSort(left), pivot, ...quickSort(right)];
        }
      `,
      expectedViolationType: null
    },
    {
      name: "Clean Express HTTP Router in JS (MIT)",
      code: `
        // SPDX-License-Identifier: MIT
        const express = require("express");
        const router = express.Router();
        router.get("/status", (req, res) => {
          res.status(200).json({ status: "alive", timestamp: Date.now() });
        });
        module.exports = router;
      `,
      expectedViolationType: null
    },
    {
      name: "Matrix Transpose Utility in TS",
      code: `
        export function transposeMatrix(matrix: number[][]): number[][] {
          const rows = matrix.length;
          const cols = matrix[0].length;
          const transposed: number[][] = Array.from({ length: cols }, () => []);
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              transposed[c][r] = matrix[r][c];
            }
          }
          return transposed;
        }
      `,
      expectedViolationType: null
    },
    {
      name: "Clean User Data Mapper Function",
      code: `
        function mapUserRecord(rawRecord) {
          return {
            id: String(rawRecord.user_id),
            fullName: \`\${rawRecord.first_name} \${rawRecord.last_name}\`,
            createdAt: new Date(rawRecord.created_at * 1000),
            isActive: Boolean(rawRecord.status === "ACTIVE")
          };
        }
      `,
      expectedViolationType: null
    },
    {
      name: "Prime Number Trial Division Check",
      code: `
        function isPrime(num) {
          if (num <= 1) return false;
          if (num <= 3) return true;
          if (num % 2 === 0 || num % 3 === 0) return false;
          for (let i = 5; i * i <= num; i += 6) {
            if (num % i === 0 || num % (i + 2) === 0) return false;
          }
          return true;
        }
      `,
      expectedViolationType: null
    },
    {
      name: "Clean Event Emitter Implementation",
      code: `
        class TinyEmitter {
          constructor() { this.listeners = {}; }
          on(evt, fn) {
            (this.listeners[evt] = this.listeners[evt] || []).push(fn);
          }
          emit(evt, data) {
            (this.listeners[evt] || []).forEach(fn => fn(data));
          }
        }
      `,
      expectedViolationType: null
    },
    {
      name: "HTML Query String Serializer",
      code: `
        function serializeParams(params) {
          return Object.keys(params)
            .map(k => \`\${encodeURIComponent(k)}=\${encodeURIComponent(params[k])}\`)
            .join("&");
        }
      `,
      expectedViolationType: null
    },
    {
      name: "Math combinations combinations recursive",
      code: `
        function getFactorial(num) {
          if (num <= 1) return 1;
          return num * getFactorial(num - 1);
        }
        function getCombinations(n, r) {
          return getFactorial(n) / (getFactorial(r) * getFactorial(n - r));
        }
      `,
      expectedViolationType: null
    },
    {
      name: "URL Queries Parser mapping map",
      code: `
        function parseQueryString(url) {
          const query = {};
          const pairs = (url.split("?")[1] || "").split("&");
          for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i].split("=");
            if (pair[0]) {
              query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
            }
          }
          return query;
        }
      `,
      expectedViolationType: null
    },

    // --- 46 to 50: Sensitive Data Detections Mixed with Permitted Headers ---
    {
      name: "MIT License containing OpenAI Key",
      code: `
        // SPDX-License-Identifier: MIT
        // OpenAI Integration
        const secretKey = "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz1234567890ab";
      `,
      expectedViolationType: "openai-api-key"
    },
    {
      name: "BSD 3-Clause containing Database URL",
      code: `
        /*
         * BSD 3-Clause License
         * Connection Manager
         */
        const mongoUrl = "mongodb+srv://admin:pass123@cluster0.abcde.mongodb.net/test?retryWrites=true";
      `,
      expectedViolationType: "database-connection-string"
    },
    {
      name: "Apache-2.0 containing JWT Token",
      code: `
        // SPDX-License-Identifier: Apache-2.0
        const sessionToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      `,
      expectedViolationType: "jwt-token"
    },
    {
      name: "ISC License containing Private Key Header",
      code: `
        /*
         * ISC License
         */
        const rootCertificate = "-----BEGIN RSA PRIVATE KEY-----\\nMIICXAIBAAKBgQ";
      `,
      expectedViolationType: "private-key-material"
    },
    {
      name: "MIT License containing AWS Access Key",
      code: `
        // SPDX-License-Identifier: MIT
        const accessKeyId = "AKIAIOSFODNN7EXAMPLE";
      `,
      expectedViolationType: "aws-access-key-id"
    }
  ];

  describe("Massive 50-Edge-Case Ingestor Compliance Suite", () => {
    complianceTestCases.forEach((tc, idx) => {
      it(`Edge Case #${idx + 1}: ${tc.name}`, () => {
        const violations = scanDocument(tc.code);
        
        if (tc.expectedViolationType === null) {
          // Verify that NO copyleft notices or structural violations exist
          const copyleftViolations = violations.filter(v => 
            v.violationType === "copyleft-license-notice" || 
            v.violationType === "restricted-gpl-similarity"
          );
          expect(copyleftViolations).toHaveLength(0);
        } else {
          // Verify that the specific violation is detected
          const targetViolations = violations.filter(v => v.violationType === tc.expectedViolationType);
          expect(targetViolations.length).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });

  // =========================================================================
  // MASSIVE 50 PURE CODE CHUNKS COMPLIANCE SUITE (NO COMMENTS OR HEADERS)
  // =========================================================================
  interface PureCodeTestCase {
    readonly name: string;
    readonly code: string;
    readonly expectedViolationType: string | null;
  }

  const pureCodeTestCases: readonly PureCodeTestCase[] = [
    // --- 1 to 25: Plagiarized GPL Structural Signatures (NO comments, NO headers) ---
    {
      name: "GPL Binary Tree Node Builder and Insertion (JS)",
      code: `function buildNode(data) {
  return { val: data, left: null, right: null };
}
function addNode(root, data) {
  if (root === null) {
    return buildNode(data);
  }
  if (data < root.val) {
    root.left = addNode(root.left, data);
  } else if (data > root.val) {
    root.right = addNode(root.right, data);
  }
  return root;
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Search/Lookup (JS)",
      code: `function buildNode(data) {
  return { val: data, left: null, right: null };
}
function findNode(root, key) {
  if (root === null) {
    return false;
  }
  if (key === root.val) {
    root.left = root.left;
    return true;
  }
  if (key < root.val) {
    return findNode(root.left, key);
  }
  return findNode(root.right, key);
}
function isPresent(root, key) {
  return findNode(root, key);
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Walk/Traversal in Order (JS)",
      code: `function buildNode(data) {
  return { val: data, left: null, right: null };
}
function traverse(node, list) {
  if (node === null) {
    return;
  }
  traverse(node.left, list);
  list.push(node.val);
  traverse(node.right, list);
}
function exportTree(node) {
  const result = [];
  traverse(node, result);
  return result;
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Find Smallest Leaf (JS)",
      code: `function minimumValue(node) {
  if (node === null) {
    throw new Error();
  }
  let current = node;
  while (current.left !== null) {
    current = current.left;
  }
  return current.val;
}
function getMin(root) {
  return minimumValue(root);
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Insertion and Lookup Combined (JS)",
      code: `function make(d) {
  return { val: d, left: null, right: null };
}
function insert(r, d) {
  if (r === null) {
    return make(d);
  }
  if (d < r.val) {
    r.left = insert(r.left, d);
  } else if (d > r.val) {
    r.right = insert(r.right, d);
  }
  return r;
}
function search(r, k) {
  if (r === null) {
    return false;
  }
  if (k === r.val) {
    return true;
  }
  if (k < r.val) {
    return search(r.left, k);
  }
  return search(r.right, k);
}
function inOrder(n, a) {
  if (n === null) {
    return;
  }
  inOrder(n.left, a);
  a.push(n.val);
  inOrder(n.right, a);
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Walk and Min Combined (JS)",
      code: `function makeRecord(v) {
  return { val: v, left: null, right: null };
}
function inOrder(n, a) {
  if (n === null) {
    return;
  }
  inOrder(n.left, a);
  a.push(n.val);
  inOrder(n.right, a);
}
function minVal(n) {
  if (n === null) {
    throw new Error();
  }
  let c = n;
  while (c.left !== null) {
    c = c.left;
  }
  return c.val;
}
function insertNode(r, d) {
  if (r === null) {
    return makeRecord(d);
  }
  if (d < r.val) {
    r.left = insertNode(r.left, d);
  } else if (d > r.val) {
    r.right = insertNode(r.right, d);
  }
  return r;
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Invert (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) InvertList() {
  var previousElement *Node
  currentElement := c.Start
  for currentElement != nil {
    followingElement := currentElement.Next
    currentElement.Next = previousElement
    previousElement = currentElement
    currentElement = followingElement
  }
  c.Start = previousElement
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Loop Detection (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) DetectLoop() bool {
  if c.Start == nil {
    return false
  }
  t := c.Start
  h := c.Start
  for h != nil && h.Next != nil {
    t = t.Next
    h = h.Next.Next
    if t == h {
      return true
    }
  }
  return false
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Insert Tail (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) AddTail(val int) {
  n := &Node{Val: val, Next: nil}
  if c.Start == nil {
    c.Start = n
    c.Count++
    return
  }
  curr := c.Start
  for curr.Next != nil {
    curr = curr.Next
  }
  curr.Next = n
  c.Count++
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Remove Duplicates (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) ClearDupes() {
  if c.Start == nil { return }
  seen := make(map[int]bool)
  curr := c.Start
  seen[curr.Val] = true
  var prev *Node = curr
  curr = curr.Next
  for curr != nil {
    if seen[curr.Val] {
      prev.Next = curr.Next
      c.Count--
    } else {
      seen[curr.Val] = true
      prev = curr
    }
    curr = curr.Next
  }
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Delete Value (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) DeleteValue(val int) bool {
  if c.Start == nil { return false }
  if c.Start.Val == val {
    c.Start = c.Start.Next
    c.Count--
    return true
  }
  curr := c.Start
  for curr.Next != nil {
    if curr.Next.Val == val {
      curr.Next = curr.Next.Next
      c.Count--
      return true
    }
    curr = curr.Next
  }
  return false
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Middle Node Finder (Go)",
      code: `package mylist
type Node struct {
  Val  int
  Next *Node
}
type Chain struct {
  Start *Node
  Count int
}
func (c *Chain) FindMiddle() int {
  if c.Start == nil { return 0 }
  slow := c.Start
  fast := c.Start
  for fast != nil && fast.Next != nil {
    slow = slow.Next
    fast = fast.Next.Next
  }
  return slow.Val
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Dijkstra Graph Path Finder (Python)",
      code: `class RoutingMap:
    def __init__(self):
        self.routes = {}
    def dijkstra_find(self, source):
        import heapq
        shortest = {node: float('inf') for node in self.routes}
        shortest[source] = 0
        pqueue = [(0, source)]
        parents = {node: None for node in self.routes}
        while pqueue:
            cost, u = heapq.heappop(pqueue)
            if cost > shortest[u]:
                continue
            for v, weight in self.routes.get(u, []):
                new_dist = cost + weight
                if new_dist < shortest[v]:
                    shortest[v] = new_dist
                    parents[v] = u
                    heapq.heappush(pqueue, (new_dist, v))
        return shortest, parents`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph BFS Traversal (Python)",
      code: `from collections import deque
class RoutingMap:
    def __init__(self):
        self.routes = {}
    def traverse_bfs(self, start):
        visited = set()
        queue = deque([start])
        visited.add(start)
        path = []
        while queue:
            node = queue.popleft()
            path.append(node)
            for neighbor, _ in self.routes.get(node, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return path`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph DFS Recursive (Python)",
      code: `class RoutingMap:
    def __init__(self):
        self.routes = {}
    def traverse_dfs(self, start):
        visited = set()
        path = []
        self._dfs_util(start, visited, path)
        return path
    def _dfs_util(self, node, visited, path):
        visited.add(node)
        path.append(node)
        for neighbor, _ in self.routes.get(node, []):
            if neighbor not in visited:
                self._dfs_util(neighbor, visited, path)`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph Topological Sort (Python)",
      code: `class GraphSorter:
    def __init__(self):
        self.routes = {}
    def sort_topo(self):
        visited = set()
        stack = []
        for node in self.routes:
            if node not in visited:
                self._sort_util(node, visited, stack)
        return stack[::-1]
    def _sort_util(self, node, visited, stack):
        visited.add(node)
        for neighbor, _ in self.routes.get(node, []):
            if neighbor not in visited:
                self._sort_util(neighbor, visited, stack)
        stack.append(node)`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph Cycle Check (Python)",
      code: `class GraphCycleDetector:
    def __init__(self):
        self.routes = {}
    def has_cycle(self):
        visited = set()
        stack = set()
        for node in self.routes:
            if node not in visited:
                if self._check_cycle(node, visited, stack):
                    return True
        return False
    def _check_cycle(self, node, visited, stack):
        visited.add(node)
        stack.add(node)
        for neighbor, _ in self.routes.get(node, []):
            if neighbor not in visited:
                if self._check_cycle(neighbor, visited, stack):
                    return True
            elif neighbor in stack:
                return True
        stack.discard(node)
        return False`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph Connected Components (Python)",
      code: `class ConnectedComponents:
    def __init__(self):
        self.routes = {}
    def get_components(self):
        visited = set()
        components = []
        for node in self.routes:
            if node not in visited:
                comp = []
                self._components_dfs(node, visited, comp)
                components.append(comp)
        return components
    def _components_dfs(self, node, visited, comp):
        visited.add(node)
        comp.append(node)
        for neighbor, _ in self.routes.get(node, []):
            if neighbor not in visited:
                self._components_dfs(neighbor, visited, comp)`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Java Min Heap SiftUp & SiftDown Logic (Java)",
      code: `package com.seed;
import java.util.List;
public class BinaryHeap {
    private List<Integer> data;
    private void adjustUp(int index) {
        while (index > 0) {
            int parent = (index - 1) / 2;
            if (data.get(index) < data.get(parent)) {
                int temp = data.get(index);
                data.set(index, data.get(parent));
                data.set(parent, temp);
                index = parent;
            } else {
                break;
            }
        }
    }
    private void adjustDown(int index) {
        int size = data.size();
        while (true) {
            int smallest = index;
            int left = 2 * index + 1;
            int right = 2 * index + 2;
            if (left < size && data.get(left) < data.get(smallest)) {
                smallest = left;
            }
            if (right < size && data.get(right) < data.get(smallest)) {
                smallest = right;
            }
            if (smallest != index) {
                int temp = data.get(index);
                data.set(index, data.get(smallest));
                data.set(smallest, temp);
                index = smallest;
            } else {
                break;
            }
        }
    }
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Java Min Heap Insertion and Extraction (Java)",
      code: `package com.seed;
import java.util.List;
public class BinaryHeap {
    private List<Integer> data;
    public void push(int val) {
        data.add(val);
        siftUp(data.size() - 1);
    }
    public int pop() {
        if (data.isEmpty()) {
            throw new IllegalStateException();
        }
        int min = data.get(0);
        int last = data.size() - 1;
        data.set(0, data.get(last));
        data.remove(last);
        if (!data.isEmpty()) {
            siftDown(0);
        }
        return min;
    }
    private void siftUp(int idx) {}
    private void siftDown(int idx) {}
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Java Min Heap Heapify and Sort Logic (Java)",
      code: `package com.seed;
import java.util.List;
import java.util.ArrayList;
public class BinaryHeap {
    private List<Integer> data;
    public void makeHeap(int[] arr) {
        data.clear();
        for (int v : arr) {
            data.add(v);
        }
        for (int i = (data.size() / 2) - 1; i >= 0; i--) {
            siftDown(i);
        }
    }
    public List<Integer> sortHeap(int[] arr) {
        makeHeap(arr);
        List<Integer> list = new ArrayList<>();
        while (!data.isEmpty()) {
            list.add(pop());
        }
        return list;
    }
    private void siftDown(int idx) {}
    private int pop() { return 0; }
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Java Min Heap Decrease Key Function (Java)",
      code: `package com.seed;
import java.util.List;
public class BinaryHeap {
    private List<Integer> data;
    public void reduceKey(int oldVal, int newVal) {
        if (newVal > oldVal) {
            throw new IllegalArgumentException();
        }
        for (int i = 0; i < data.size(); i++) {
            if (data.get(i) == oldVal) {
                data.set(i, newVal);
                siftUp(i);
                return;
            }
        }
        throw new IllegalArgumentException();
    }
    private void siftUp(int idx) {}
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Binary Tree Node Insertion and Extraction combined variant (JS)",
      code: `function nodeMake(val) {
  return { val: val, left: null, right: null };
}
function nodeAdd(r, val) {
  if (r === null) {
    return nodeMake(val);
  }
  if (val < r.val) {
    r.left = nodeAdd(r.left, val);
  } else if (val > r.val) {
    r.right = nodeAdd(r.right, val);
  }
  return r;
}
function nodeSearch(r, key) {
  if (r === null) {
    return false;
  }
  if (key === r.val) {
    return true;
  }
  if (key < r.val) {
    return nodeSearch(r.left, key);
  }
  return nodeSearch(r.right, key);
}
function nodeWalk(n, a) {
  if (n === null) {
    return;
  }
  nodeWalk(n.left, a);
  a.push(n.val);
  nodeWalk(n.right, a);
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Go Linked List Search and Invert combined variant (Go)",
      code: `package mylist
type Element struct {
  Val  int
  Next *Element
}
type Chain struct {
  Start *Element
}
func (c *Chain) Invert() {
  var prev *Element
  curr := c.Start
  for curr != nil {
    next := curr.Next
    curr.Next = prev
    prev = curr
    curr = next
  }
  c.Start = prev
}
func (c *Chain) Search(target int) bool {
  curr := c.Start
  for curr != nil {
    if curr.Val == target { return true }
    curr = curr.Next
  }
  return false
}`,
      expectedViolationType: "restricted-gpl-similarity"
    },
    {
      name: "GPL Python Graph Dijkstra with Cycle Checking combined variant (Python)",
      code: `class GraphEngine:
    def __init__(self):
        self.routes = {}
    def run_dijkstra(self, source):
        import heapq
        shortest = {node: float('inf') for node in self.routes}
        shortest[source] = 0
        pqueue = [(0, source)]
        while pqueue:
            cost, u = heapq.heappop(pqueue)
            if cost > shortest[u]:
                continue
            for v, weight in self.routes.get(u, []):
                new_dist = cost + weight
                if new_dist < shortest[v]:
                    shortest[v] = new_dist
                    heapq.heappush(pqueue, (new_dist, v))
        return shortest`,
      expectedViolationType: "restricted-gpl-similarity"
    },

    // --- 26 to 50: Permitted Clean Code Chunks (NO comments, NO headers) ---
    {
      name: "Clean Fibonacci Memoized Recursion (TS)",
      code: `export function fibonacci(n: number, memo: Record<number, number> = {}): number {
  if (n <= 1) return n;
  if (n in memo) return memo[n];
  memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo);
  return memo[n];
}
export function getSequence(limit: number): number[] {
  const seq = [];
  for (let i = 0; i < limit; i++) {
    seq.push(fibonacci(i));
  }
  return seq;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean QuickSort Algorithm (JS)",
      code: `function partition(arr, low, high) {
  const pivot = arr[high];
  let i = low - 1;
  for (let j = low; j < high; j++) {
    if (arr[j] < pivot) {
      i++;
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
  }
  const temp = arr[i + 1];
  arr[i + 1] = arr[high];
  arr[high] = temp;
  return i + 1;
}
function quickSortHelper(arr, low, high) {
  if (low < high) {
    const pi = partition(arr, low, high);
    quickSortHelper(arr, low, pi - 1);
    quickSortHelper(arr, pi + 1, high);
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Prime Numbers Trial Division (JS)",
      code: `function isPrimeNumber(n) {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}
function findPrimesInRange(start, end) {
  const list = [];
  for (let i = start; i <= end; i++) {
    if (isPrimeNumber(i)) list.push(i);
  }
  return list;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Express Server Routing Configuration (JS)",
      code: `const express = require("express");
const app = express();
app.use(express.json());
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", time: Date.now() });
});
app.post("/submit", (req, res) => {
  const data = req.body;
  if (!data.id) {
    return res.status(400).send("missing_id");
  }
  res.status(201).json({ success: true, id: data.id });
});`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom Event Emitter Class (JS)",
      code: `class CustomEmitter {
  constructor() {
    this.events = {};
  }
  addListener(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }
  dispatchEvent(event, payload) {
    if (!this.events[event]) return;
    this.events[event].forEach((cb) => cb(payload));
  }
  removeListener(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((cb) => cb !== listener);
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Matrix Multiplication Operations (TS)",
      code: `export function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const aRows = a.length;
  const aCols = a[0].length;
  const bCols = b[0].length;
  const result: number[][] = Array.from({ length: aRows }, () => new Array(bCols).fill(0));
  for (let r = 0; r < aRows; r++) {
    for (let c = 0; c < bCols; c++) {
      for (let i = 0; i < aCols; i++) {
        result[r][c] += a[r][i] * b[i][c];
      }
    }
  }
  return result;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean URL Router Query String Parser (JS)",
      code: `function getQueries(url) {
  const queryMap = {};
  const queryPart = url.split("?")[1];
  if (!queryPart) return queryMap;
  const pairs = queryPart.split("&");
  for (let i = 0; i < pairs.length; i++) {
    const part = pairs[i].split("=");
    if (part[0]) {
      queryMap[decodeURIComponent(part[0])] = decodeURIComponent(part[1] || "");
    }
  }
  return queryMap;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Object Deep Clone Utility (JS)",
      code: `function deepCopyObject(source) {
  if (source === null || typeof source !== "object") {
    return source;
  }
  if (Array.isArray(source)) {
    const clone = [];
    for (let i = 0; i < source.length; i++) {
      clone[i] = deepCopyObject(source[i]);
    }
    return clone;
  }
  const clone = {};
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      clone[key] = deepCopyObject(source[key]);
    }
  }
  return clone;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean LRU Cache Storage Engine (JS)",
      code: `class CacheEngine {
  constructor(capacity) {
    this.capacity = capacity;
    this.store = new Map();
  }
  retrieve(key) {
    if (!this.store.has(key)) return null;
    const value = this.store.get(key);
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }
  insert(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, value);
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom Redux State Store Class (JS)",
      code: `class CustomStateStore {
  constructor(reducer, preloadedState) {
    this.reducer = reducer;
    this.currentState = preloadedState;
    this.listeners = [];
  }
  getState() {
    return this.currentState;
  }
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  dispatch(action) {
    this.currentState = this.reducer(this.currentState, action);
    this.listeners.forEach((l) => l());
    return action;
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Caesar Cipher Encryption Utility (JS)",
      code: `function encryptCaesarCipher(text, shift) {
  let output = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      output += String.fromCharCode(((code - 65 + shift) % 26) + 65);
    } else if (code >= 97 && code <= 122) {
      output += String.fromCharCode(((code - 97 + shift) % 26) + 97);
    } else {
      output += text.charAt(i);
    }
  }
  return output;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean CSV String Stream Parser (JS)",
      code: `function parseCsvString(input) {
  const lines = input.split(/\\r?\\n/);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const columns = [];
    const fields = line.split(",");
    for (let j = 0; j < fields.length; j++) {
      columns.push(fields[j].replace(/^"|"$/g, "").trim());
    }
    result.push(columns);
  }
  return result;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Date String Formatter Engine (JS)",
      code: `function formatDateObject(date, pattern) {
  const d = new Date(date);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const hr = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const sc = String(d.getSeconds()).padStart(2, "0");
  return pattern
    .replace("YYYY", String(yr))
    .replace("MM", mo)
    .replace("DD", dy)
    .replace("hh", hr)
    .replace("mm", mi)
    .replace("ss", sc);
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Validation Schema Form Checker (JS)",
      code: `function validateSchema(data, schema) {
  const errors = {};
  for (const field in schema) {
    const rules = schema[field];
    const val = data[field];
    if (rules.required && (val === undefined || val === null || val === "")) {
      errors[field] = "required";
    }
    if (rules.minLength && typeof val === "string" && val.length < rules.minLength) {
      errors[field] = "too_short";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom Middleware Chain Dispatcher (JS)",
      code: `class MiddlewareDispatcher {
  constructor() {
    this.stack = [];
  }
  use(fn) {
    this.stack.push(fn);
  }
  dispatch(req, res, callback) {
    let index = 0;
    const next = (err) => {
      if (err) return callback(err);
      if (index >= this.stack.length) return callback();
      const middleware = this.stack[index++];
      try {
        middleware(req, res, next);
      } catch (ex) {
        next(ex);
      }
    };
    next();
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Pub Sub Broker Event Bus (JS)",
      code: `class PubSubBroker {
  constructor() {
    this.topics = {};
  }
  publish(topic, info) {
    if (!this.topics[topic]) return;
    this.topics[topic].forEach((subscriber) => subscriber(info));
  }
  subscribe(topic, subscriber) {
    if (!this.topics[topic]) {
      this.topics[topic] = [];
    }
    this.topics[topic].push(subscriber);
    return () => {
      this.topics[topic] = this.topics[topic].filter((s) => s !== subscriber);
    };
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom BST Implementation (JS)",
      code: `class BinarySearchTreeNode {
  constructor(key) {
    this.key = key;
    this.left = null;
    this.right = null;
  }
  add(key) {
    if (key < this.key) {
      if (this.left === null) this.left = new BinarySearchTreeNode(key);
      else this.left.add(key);
    } else if (key > this.key) {
      if (this.right === null) this.right = new BinarySearchTreeNode(key);
      else this.right.add(key);
    }
  }
  contains(key) {
    if (key === this.key) return true;
    if (key < this.key && this.left !== null) return this.left.contains(key);
    if (key > this.key && this.right !== null) return this.right.contains(key);
    return false;
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Command Router Controller Bus (JS)",
      code: `class CommandRouterBus {
  constructor() {
    this.handlers = new Map();
  }
  register(commandName, handler) {
    this.handlers.set(commandName, handler);
  }
  execute(commandName, payload) {
    if (!this.handlers.has(commandName)) {
      throw new Error("missing_handler");
    }
    const handler = this.handlers.get(commandName);
    return handler(payload);
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom Dependency Injector Container (JS)",
      code: `class DependencyInjectorContainer {
  constructor() {
    this.services = new Map();
  }
  register(name, factory) {
    this.services.set(name, factory);
  }
  resolve(name) {
    if (!this.services.has(name)) {
      throw new Error("unresolved_dependency");
    }
    const factory = this.services.get(name);
    return factory(this);
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Grid Pathfinder Matrix Solver (JS)",
      code: `function findGridPath(grid, startRow, startCol, endRow, endCol) {
  const queue = [[startRow, startCol, 0]];
  const visited = new Set([\`\${startRow},\${startCol}\`]);
  const rows = grid.length;
  const cols = grid[0].length;
  while (queue.length > 0) {
    const [r, c, dist] = queue.shift();
    if (r === endRow && c === endCol) return dist;
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let i = 0; i < dirs.length; i++) {
      const nr = r + dirs[i][0];
      const nc = c + dirs[i][1];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0) {
        const key = \`\${nr},\${nc}\`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc, dist + 1]);
        }
      }
    }
  }
  return -1;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean String Utility Sanitization Handler (JS)",
      code: `function sanitizeStringInput(text) {
  if (typeof text !== "string") return "";
  let clean = text.trim();
  clean = clean.replace(/&/g, "&amp;");
  clean = clean.replace(/</g, "&lt;");
  clean = clean.replace(/>/g, "&gt;");
  clean = clean.replace(/"/g, "&quot;");
  clean = clean.replace(/'/g, "&#x27;");
  clean = clean.replace(/\\//g, "&#x2F;");
  return clean;
}`,
      expectedViolationType: null
    },
    {
      name: "Clean JSON Schema Validator Rule Engine (JS)",
      code: `function validateJsonSchema(obj, properties) {
  const missing = [];
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    if (obj[prop] === undefined || obj[prop] === null) {
      missing.push(prop);
    }
  }
  return {
    valid: missing.length === 0,
    missingProperties: missing
  };
}`,
      expectedViolationType: null
    },
    {
      name: "Clean HTTP Service Client Builder class (JS)",
      code: `class HttpServiceClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  buildUrl(endpoint, params) {
    const url = new URL(endpoint, this.baseUrl);
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        url.searchParams.append(key, String(params[key]));
      }
    }
    return url.toString();
  }
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Custom Redux State Store Combined Setup (JS)",
      code: `function combineStores(stores) {
  return (state = {}, action) => {
    const nextState = {};
    for (const key in stores) {
      nextState[key] = stores[key](state[key], action);
    }
    return nextState;
  };
}`,
      expectedViolationType: null
    },
    {
      name: "Clean Matrix Transpose helper utility (JS)",
      code: `function transposeGridMatrix(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const transposed = [];
  for (let c = 0; c < cols; c++) {
    const newRow = [];
    for (let r = 0; r < rows; r++) {
      newRow.push(grid[r][c]);
    }
    transposed.push(newRow);
  }
  return transposed;
}`,
      expectedViolationType: null
    }
  ];

  describe("Massive 50 Pure Code Chunks Compliance Suite (NO COMMENTS OR HEADERS)", () => {
    pureCodeTestCases.forEach((tc, idx) => {
      it(`Pure Code Case #${idx + 1}: ${tc.name}`, () => {
        const violations = scanDocument(tc.code);
        
        if (tc.expectedViolationType === null) {
          // Verify that NO copyleft notices or structural violations exist
          const copyleftViolations = violations.filter(v => 
            v.violationType === "copyleft-license-notice" || 
            v.violationType === "restricted-gpl-similarity"
          );
          expect(copyleftViolations).toHaveLength(0);
        } else {
          // Verify that the specific violation is detected
          const targetViolations = violations.filter(v => v.violationType === tc.expectedViolationType);
          expect(targetViolations.length).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });
});



