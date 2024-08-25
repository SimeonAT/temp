---
title: 'Unit Tests for the Ionic Capacitor Codetrix Plugin'
description: "Writing Unit Tests for the Capacitor Codetrix Plugin that Implements Google OAuth"
date: 2023-06-18
draft: false
---

I was doing some research on how to write unit tests for source code that utilizes the [Codetrix Capacitor Google Auth plugin](https://github.com/CodetrixStudio/CapacitorGoogleAuth). However, I don't believe I found any resources on how to do so.

As a result, I decided to give it a try and write my own unit tests to test the functionality of a simple project that uses the Codetrix Google Auth plugin (and Firebase) for implementing Google OAuth.


## The Source Code to Test

Using React and Typescript, I wrote a simple Ionic web app that only allows a user to login and logout. All of the source code I have written is in this [Github repository](https://github.com/SimeonAT/IonicCodetrixUnitTests).

All of the React components are grouped together in the `/src/components` directory. All of the code that uses the Codetrix Google Auth plugin (and Firebase) are stored in the source file `oauth.ts`.

## The Unit Tests for Login

The unit tests for the login functionality are relatively straightforward. They simply click the login button and check if the necessary functions to complete the login have successfully returned.

As an example, the unit test for the login workflow, for when the user
is not initially logged in, is displayed below.
```tsx
test('OAuth login workflow occurs', async () => {
  const mockContext = {
    user: null,
    setUser: vi.fn(() => {}),
  }

  render(
    <Context.Provider value={mockContext}>
      <Login />
    </Context.Provider>
  );

  fireEvent.click(
    screen.getByText('OAuth Login')
  );

  await waitFor(() => {
    expect(signInWithCredential).toHaveReturned();
  });

  return;
});
```

All login unit tests are in the [source file](https://github.com/SimeonAT/IonicCodetrixUnitTests/blob/main/unit-tests-demo/src/tests/Login.test.tsx) `Login.test.tsx`.

### Why Mocks are Needed to Properly Test Login

Notice how the login unit test does not take any actions in a typical login workflow (i.e. entering a username and password in the Google sign-in webpage); the test simply clicks the login button and checks if the necessary mock function has returned. This is because I wrote mock functions to mock the Google OAuth login.

This may seem counter-intuitive at first, since the whole point of the unit tests is to test that the web app functions properly when a user goes through the process of logging in. However, the code implementing Google OAuth is not written by us; it is provided to us through the Codetrix Capacitor plugin and Firebase.

To emphasize this point, let us take a look at the `signIn()` [function](https://github.com/SimeonAT/IonicCodetrixUnitTests/blob/main/unit-tests-demo/src/handlers/oauth.ts#L41) in `oauth.ts`:
```typescript
function signIn(auth: Auth) {
  return codetrix.GoogleAuth.signIn()
    .then((user) => {
      return GoogleAuthProvider.credential(
        user.authentication.idToken
      );
    })
    .then((credentials) => {
      return signInWithCredential(auth, credentials);
    });
}
```

The Codetrix `signIn()` function, and the Firebase `signInWithCredential()` function and `GoogleAuthProvider` class does *all the heavy lifting* in implementing Google OAuth login. The `signIn()` function is merely a wrapper that just calls the functions provided by Codetrix and Firebase, passing in the necessary arguments to where they are needed. 

In turn, the event handler in our `Login.tsx` [component](https://github.com/SimeonAT/IonicCodetrixUnitTests/blob/main/unit-tests-demo/src/components/login/index.tsx#LL7C1-L29C2) just calls our `signIn()` function:
```tsx
<IonButton size="default" onClick={() => {
  oauth.loginHandler().then((user) => {
    context?.setUser(oauth.getUserInfo(user));
  })
  ...
}}>
  OAuth Login
</IonButton>
```

The details of the Google OAuth login, and its success or failure, is handeled by both Codetrix and Firebase. Thus, we only need to test if our source code is able to use the provided functions that implement Google OAuth.

### Writing the Mocks Functions

At the top of `Login.test.tsx`, I have written the mock functions needed for the login unit tests:
```typescript
vi.mock('@codetrix-studio/capacitor-google-auth', () => {
  const mockCodetrixUser = {
    authentication: {
      idToken: "test token",
    }
  } as codetrix.User

  return {
    GoogleAuth: {
      signIn: vi.fn(() => {
        return Promise.resolve(mockCodetrixUser);
      }),
    },
  };
});

vi.mock('firebase/auth', () => {
  return {
    GoogleAuthProvider: {
      credential: vi.fn((idToken: string) => idToken),
    },
    signInWithCredential: vi.fn(() => {}),
    getAuth: vi.fn(() => {
      return {} as Auth
    }),
  };
});
```

These mocks simply are minimal implementations for the Codetrix and Firebase functions that are needed in order for `signIn()` to function properly.

## The Unit Tests for Logout

The unit test for logout (in `Dashboard.test.tsx`) essentially follow the same philosophy I highlighted when discussing the login unit tests.



```tsx
test('User logs out', async () => {
  const mockContext = {
    user: mockUser,
    setUser: vi.fn(() => {}),
  }

  render(
    <Context.Provider value={mockContext}>
      <Dashboard />
    </Context.Provider>
  );

  fireEvent.click(
    screen.getByText('Log out')
  );

  await waitFor(() => {
    expect(signOut).toHaveReturned();
  });

  return;
});
```

However, since the implementation for the `logoutHandler()` logout function is much simpler:
```typescript
export async function logoutHandler() {
  signOut(auth());
  return;
}
```

The mocks for the logout unit tests are straightforward:
```typescript
vi.mock('firebase/auth', () => {
  return {
    signOut: vi.fn(() => {}),
    getAuth: vi.fn(() => {
      return {} as Auth
    }),
  };
});
```

## Conclusion

I hope my approach had shed some light on how unit tests can be written for the [Codetrix Capacitor Google Auth plugin](https://github.com/CodetrixStudio/CapacitorGoogleAuth).
