import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { RegisterComponent } from './register.component';

describe('Authentication forms', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, RegisterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('requires a valid email and password to sign in', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    expect(component.form.invalid).toBe(true);
    component.form.controls.email.setValue('person@example.com');
    component.form.controls.password.setValue('secret');
    expect(component.form.valid).toBe(true);
  });

  it('enforces the backend password rules for registration', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      firstName: 'Sample',
      lastName: 'Person',
      email: 'person@example.com',
      password: 'short',
    });
    expect(component.form.invalid).toBe(true);

    component.form.controls.password.setValue('ValidPassword123!');
    expect(component.form.valid).toBe(true);
  });
});
