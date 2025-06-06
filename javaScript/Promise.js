class MyPromise {
    constructor(executor) {
        this.state = 'pending';
        this.value = undefined;
        this.handlers = []; // Stores { onFulfilled, onRejected, resolve, reject } for chaining

        const resolve = (value) => {
            // A promise can only be settled once
            if (this.state !== 'pending') return;

            // If the value is a 'thenable' (another promise-like object),
            // we need to resolve it recursively. This is a crucial part
            // of the Promises/A+ spec.
            if (value && typeof value.then === 'function') {
                try {
                    value.then(resolve, reject);
                } catch (error) {
                    reject(error);
                }
                return;
            }

            this.state = 'fulfilled';
            this.value = value;
            this.executeHandlers(); // Execute all stored handlers
        };

        const reject = (reason) => {
            // A promise can only be settled once
            if (this.state !== 'pending') return;

            this.state = 'rejected';
            this.value = reason;
            this.executeHandlers(); // Execute all stored handlers
        };

        try {
            executor(resolve, reject);
        } catch (error) {
            reject(error); // Catches synchronous errors in the executor function
        }
    }

    // Handles executing callbacks ensuring async execution
    executeHandlers() {
        if (this.state === 'pending') return;

        // Use setTimeout(0) to mimic asynchronous execution (microtask queue)
        setTimeout(() => {
            this.handlers.forEach(handler => {
                const { onFulfilled, onRejected, resolve, reject } = handler;
                try {
                    if (this.state === 'fulfilled') {
                        // If onFulfilled is a function, call it and resolve the next promise with its result
                        // Otherwise, simply pass the current promise's value to the next promise
                        const result = typeof onFulfilled === 'function' ? onFulfilled(this.value) : this.value;
                        resolve(result);
                    } else if (this.state === 'rejected') {
                        // If onRejected is a function, call it and resolve the next promise with its result (error recovery)
                        // If onRejected is not a function, then the error propagates, so reject the next promise
                        if (typeof onRejected === 'function') {
                            const result = onRejected(this.value);
                            resolve(result); // Error handled, so the next promise resolves
                        } else {
                            reject(this.value); // Error not handled, propagate rejection
                        }
                    }
                } catch (error) {
                    reject(error); // Catch errors thrown within the handler callbacks
                }
            });
            this.handlers = []; // Clear handlers after execution
        }, 0);
    }

    // Instance method: .then()
    then(onFulfilled, onRejected) {
        // .then() always returns a new promise to enable chaining
        return new MyPromise((resolve, reject) => {
            // Store the handlers along with the new promise's resolve/reject functions
            this.handlers.push({ onFulfilled, onRejected, resolve, reject });

            // If the promise is already settled, execute handlers immediately (asynchronously)
            if (this.state !== 'pending') {
                this.executeHandlers();
            }
        });
    }

    // Instance method: .catch()
    catch(onRejected) {
        // .catch() is just syntactic sugar for .then(null, onRejected)
        return this.then(null, onRejected);
    }

    // Instance method: .finally()
    finally(onFinally) {
        // .finally() allows running a cleanup function regardless of state
        // It passes through the original value/reason
        return this.then(
            value => {
                // Execute onFinally, then pass on the original value
                return MyPromise.resolve(onFinally()).then(() => value);
            },
            reason => {
                // Execute onFinally, then re-reject with the original reason
                return MyPromise.resolve(onFinally()).then(() => { throw reason; });
            }
        );
    }

    // Static method: MyPromise.resolve()
    static resolve(value) {
        return new MyPromise(resolve => resolve(value));
    }

    // Static method: MyPromise.reject()
    static reject(reason) {
        return new MyPromise((_, reject) => reject(reason));
    }

    // Static method: MyPromise.all()
    static all(promises) {
        return new MyPromise((resolve, reject) => {
            const results = [];
            let completed = 0;
            const total = promises.length;

            if (total === 0) {
                resolve([]);
                return;
            }

            promises.forEach((promise, index) => {
                MyPromise.resolve(promise).then(value => {
                    results[index] = value;
                    completed++;
                    if (completed === total) {
                        resolve(results);
                    }
                }).catch(reason => {
                    reject(reason); // If any promise rejects, all() rejects
                });
            });
        });
    }

    // Static method: MyPromise.race()
    static race(promises) {
        return new MyPromise((resolve, reject) => {
            promises.forEach(promise => {
                // The first promise to settle wins
                MyPromise.resolve(promise).then(resolve).catch(reject);
            });
        });
    }

    // Static method: MyPromise.allSettled()
    static allSettled(promises) {
        return new MyPromise(resolve => {
            const results = [];
            let completed = 0;
            const total = promises.length;

            if (total === 0) {
                resolve([]);
                return;
            }

            promises.forEach((promise, index) => {
                MyPromise.resolve(promise)
                    .then(value => {
                        results[index] = { status: 'fulfilled', value };
                    })
                    .catch(reason => {
                        results[index] = { status: 'rejected', reason };
                    })
                    .finally(() => {
                        completed++;
                        if (completed === total) {
                            resolve(results);
                        }
                    });
            });
        });
    }

    // Static method: MyPromise.any()
    static any(promises) {
        return new MyPromise((resolve, reject) => {
            let rejectedCount = 0;
            const errors = [];
            const total = promises.length;

            if (total === 0) {
                reject(new AggregateError([], 'All promises were rejected'));
                return;
            }

            promises.forEach((promise, index) => {
                MyPromise.resolve(promise)
                    .then(value => {
                        resolve(value); // Resolve with the first fulfilled value
                    })
                    .catch(error => {
                        errors[index] = error; // Store individual errors
                        rejectedCount++;
                        if (rejectedCount === total) {
                            // If all promises rejected, reject with AggregateError
                            reject(new AggregateError(errors, 'All promises were rejected'));
                        }
                    });
            });
        });
    }
}

// --- Testing the MyPromise Polyfill ---

console.log("\n--- Testing MyPromise Polyfill ---");

// Test basic resolve
new MyPromise((resolve) => {
    setTimeout(() => resolve("Hello from MyPromise!"), 500);
})
    .then(msg => console.log("MyPromise resolved:", msg))
    .catch(err => console.error("MyPromise caught error:", err));

// Test basic reject
new MyPromise((_, reject) => {
    setTimeout(() => reject(new Error("MyPromise failed!")), 200);
})
    .then(msg => console.log("MyPromise won't run this then:", msg))
    .catch(err => console.error("MyPromise caught rejection:", err.message))
    .finally(() => console.log("MyPromise finally for rejected."));

// Test chaining
new MyPromise(resolve => {
    setTimeout(() => resolve(10), 100);
})
    .then(val => {
        console.log("Chaining - step 1:", val);
        return val * 2;
    })
    .then(val => {
        console.log("Chaining - step 2:", val);
        return new MyPromise(res => setTimeout(() => res(val + 5), 50)); // Return another promise
    })
    .then(val => {
        console.log("Chaining - step 3 (from nested promise):", val);
        throw new Error("Oops, chaining error!"); // Introduce an error
    })
    .catch(error => {
        console.error("Chaining - caught error:", error.message);
    })
    .finally(() => {
        console.log("Chaining - finally block executed.");
    });


// Test MyPromise.all
const myPAll1 = MyPromise.resolve(1);
const myPAll2 = new MyPromise(res => setTimeout(() => res(2), 50));
const myPAll3 = MyPromise.resolve(3);

MyPromise.all([myPAll1, myPAll2, myPAll3])
    .then(results => console.log("MyPromise.all results:", results)) // [1, 2, 3]
    .catch(err => console.error("MyPromise.all error:", err));

const myPAllError = new MyPromise((_, reject) => setTimeout(() => reject("All Error"), 10));
MyPromise.all([myPAll1, myPAllError, myPAll3])
    .then(results => console.log("MyPromise.all (will not resolve):", results))
    .catch(err => console.error("MyPromise.all with error:", err)); // "All Error"

// Test MyPromise.race
const myPRace1 = new MyPromise(res => setTimeout(() => res("Race 1"), 100));
const myPRace2 = new MyPromise(res => setTimeout(() => res("Race 2"), 50));
const myPRace3 = new MyPromise((_, rej) => setTimeout(() => rej("Race Error"), 20));

MyPromise.race([myPRace1, myPRace2, myPRace3])
    .then(result => console.log("MyPromise.race winner:", result)) // "Race Error" (p3 is fastest and rejects)
    .catch(err => console.error("MyPromise.race error:", err));

// Test MyPromise.allSettled
const myPSettled1 = MyPromise.resolve("Settled Success");
const myPSettled2 = new MyPromise((_, rej) => setTimeout(() => rej("Settled Failure"), 10));
const myPSettled3 = MyPromise.resolve("Another Success");

MyPromise.allSettled([myPSettled1, myPSettled2, myPSettled3])
    .then(results => console.log("MyPromise.allSettled results:", results));
/* Expected output for allSettled:
[
  { status: 'fulfilled', value: 'Settled Success' },
  { status: 'rejected', reason: 'Settled Failure' },
  { status: 'fulfilled', value: 'Another Success' }
]
*/

// Test MyPromise.any
const myPAny1 = new MyPromise((_, reject) => setTimeout(() => reject("Any Error 1"), 200));
const myPAny2 = new MyPromise(resolve => setTimeout(() => resolve("Any Success 2"), 100));
const myPAny3 = new MyPromise((_, reject) => setTimeout(() => reject("Any Error 3"), 50));

MyPromise.any([myPAny1, myPAny2, myPAny3])
    .then(result => console.log("MyPromise.any success:", result)) // "Any Success 2"
    .catch(err => console.error("MyPromise.any error:", err.errors));

const myPAnyAllReject1 = new MyPromise((_, reject) => setTimeout(() => reject("Any All Reject 1"), 100));
const myPAnyAllReject2 = new MyPromise((_, reject) => setTimeout(() => reject("Any All Reject 2"), 50));

MyPromise.any([myPAnyAllReject1, myPAnyAllReject2])
    .then(result => console.log("MyPromise.any (should not resolve):", result))
    .catch(err => console.error("MyPromise.any (all rejected):", err.errors)); // Array of errors