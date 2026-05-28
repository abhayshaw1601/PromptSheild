# GPL-3.0 Licensed Sample: Graph Algorithms
# SPDX-License-Identifier: GPL-3.0-only
#
# This program is free software: you can redistribute it
# and/or modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation, version 3.
#
# Seed fingerprint source for PromptShield Bloom filter compiler.

from collections import deque


class Graph:
    def __init__(self, directed=False):
        self.adjacency = {}
        self.directed = directed

    def add_vertex(self, vertex):
        if vertex not in self.adjacency:
            self.adjacency[vertex] = []

    def add_edge(self, source, destination, weight=1):
        self.add_vertex(source)
        self.add_vertex(destination)
        self.adjacency[source].append((destination, weight))
        if not self.directed:
            self.adjacency[destination].append((source, weight))

    def bfs(self, start):
        visited = set()
        queue = deque([start])
        visited.add(start)
        result = []

        while queue:
            vertex = queue.popleft()
            result.append(vertex)

            for neighbor, _ in self.adjacency.get(vertex, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return result

    def dfs(self, start):
        visited = set()
        result = []
        self._dfs_recursive(start, visited, result)
        return result

    def _dfs_recursive(self, vertex, visited, result):
        visited.add(vertex)
        result.append(vertex)

        for neighbor, _ in self.adjacency.get(vertex, []):
            if neighbor not in visited:
                self._dfs_recursive(neighbor, visited, result)

    def dijkstra(self, start):
        import heapq

        distances = {v: float('inf') for v in self.adjacency}
        distances[start] = 0
        priority_queue = [(0, start)]
        previous = {v: None for v in self.adjacency}

        while priority_queue:
            current_distance, current_vertex = heapq.heappop(priority_queue)

            if current_distance > distances[current_vertex]:
                continue

            for neighbor, weight in self.adjacency.get(current_vertex, []):
                distance = current_distance + weight

                if distance < distances[neighbor]:
                    distances[neighbor] = distance
                    previous[neighbor] = current_vertex
                    heapq.heappush(priority_queue, (distance, neighbor))

        return distances, previous

    def has_cycle(self):
        visited = set()
        rec_stack = set()

        for vertex in self.adjacency:
            if vertex not in visited:
                if self._has_cycle_util(vertex, visited, rec_stack):
                    return True

        return False

    def _has_cycle_util(self, vertex, visited, rec_stack):
        visited.add(vertex)
        rec_stack.add(vertex)

        for neighbor, _ in self.adjacency.get(vertex, []):
            if neighbor not in visited:
                if self._has_cycle_util(neighbor, visited, rec_stack):
                    return True
            elif neighbor in rec_stack:
                return True

        rec_stack.discard(vertex)
        return False

    def topological_sort(self):
        visited = set()
        stack = []

        for vertex in self.adjacency:
            if vertex not in visited:
                self._topological_sort_util(vertex, visited, stack)

        return stack[::-1]

    def _topological_sort_util(self, vertex, visited, stack):
        visited.add(vertex)

        for neighbor, _ in self.adjacency.get(vertex, []):
            if neighbor not in visited:
                self._topological_sort_util(neighbor, visited, stack)

        stack.append(vertex)

    def connected_components(self):
        visited = set()
        components = []

        for vertex in self.adjacency:
            if vertex not in visited:
                component = []
                self._dfs_recursive(vertex, visited, component)
                components.append(component)

        return components
