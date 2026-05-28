/**
 * GPL-3.0 Licensed Sample: Priority Queue / Min-Heap
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This program is free software: you can redistribute it
 * and/or modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation, version 3.
 *
 * Seed fingerprint source for PromptShield Bloom filter compiler.
 */

package com.promptshield.seed;

import java.util.ArrayList;
import java.util.List;

public class MinHeap {

    private final List<Integer> heap;

    public MinHeap() {
        this.heap = new ArrayList<>();
    }

    public void insert(int value) {
        heap.add(value);
        siftUp(heap.size() - 1);
    }

    public int extractMin() {
        if (heap.isEmpty()) {
            throw new IllegalStateException("Heap is empty");
        }

        int min = heap.get(0);
        int lastIndex = heap.size() - 1;
        heap.set(0, heap.get(lastIndex));
        heap.remove(lastIndex);

        if (!heap.isEmpty()) {
            siftDown(0);
        }

        return min;
    }

    public int peek() {
        if (heap.isEmpty()) {
            throw new IllegalStateException("Heap is empty");
        }

        return heap.get(0);
    }

    public int size() {
        return heap.size();
    }

    public boolean isEmpty() {
        return heap.isEmpty();
    }

    private void siftUp(int index) {
        while (index > 0) {
            int parentIndex = (index - 1) / 2;

            if (heap.get(index) < heap.get(parentIndex)) {
                swap(index, parentIndex);
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    private void siftDown(int index) {
        int size = heap.size();

        while (true) {
            int smallest = index;
            int leftChild = 2 * index + 1;
            int rightChild = 2 * index + 2;

            if (leftChild < size && heap.get(leftChild) < heap.get(smallest)) {
                smallest = leftChild;
            }

            if (rightChild < size && heap.get(rightChild) < heap.get(smallest)) {
                smallest = rightChild;
            }

            if (smallest != index) {
                swap(index, smallest);
                index = smallest;
            } else {
                break;
            }
        }
    }

    private void swap(int i, int j) {
        int temp = heap.get(i);
        heap.set(i, heap.get(j));
        heap.set(j, temp);
    }

    public void heapify(int[] array) {
        heap.clear();

        for (int value : array) {
            heap.add(value);
        }

        for (int i = (heap.size() / 2) - 1; i >= 0; i--) {
            siftDown(i);
        }
    }

    public List<Integer> heapSort(int[] array) {
        heapify(array);
        List<Integer> sorted = new ArrayList<>();

        while (!heap.isEmpty()) {
            sorted.add(extractMin());
        }

        return sorted;
    }

    public boolean contains(int value) {
        for (int element : heap) {
            if (element == value) {
                return true;
            }
        }

        return false;
    }

    public void decreaseKey(int oldValue, int newValue) {
        if (newValue > oldValue) {
            throw new IllegalArgumentException("New value must be smaller");
        }

        for (int i = 0; i < heap.size(); i++) {
            if (heap.get(i) == oldValue) {
                heap.set(i, newValue);
                siftUp(i);
                return;
            }
        }

        throw new IllegalArgumentException("Value not found in heap");
    }
}
